import json
import random
import time
from pathlib import Path

import gevent
import requests
import websocket
from locust import User, task, between, events

USERS_FILE = Path(__file__).parent / "users.json"
HEARTBEAT_INTERVAL = 30  # front의 PING_INTERVAL_MS와 동일 주기


def load_accounts() -> tuple[str, list[dict]]:
    data = json.loads(USERS_FILE.read_text())
    return data["room_id"], data["users"]


ROOM_ID, ACCOUNTS = load_accounts()
_account_iter = iter(ACCOUNTS)


def next_account():
    # 여러 ChatUser가 거의 동시에 on_start를 호출해도
    # gevent는 I/O를 기다릴 떄만 다른 greelet으로 전환하고
    # 순수 파이썬 연산(next() 자체)은 중간에 끊기지 않으므로 별도 락 없이 안전함.
    try:
        return next(_account_iter)
    except StopIteration:
        raise RuntimeError(
            f"등록된 테스트 계정({len(ACCOUNTS)})보다 가상 사용자 수가 많음. "
            "seed_users.py의 TOTAL_USERS를 늘려서 다시 시딩해야함."
        )


# Locust의 User를 상속받는 이유: 기존 HttpUser는 REST 전용이라 WebSocket을 못 다룸.
# User는 아무 기능도 강제하지 않는 빈베이스 클래스라서 REST와 WS를 원하는 순서대로 자유롭게 조합할 수 있음.
class ChatUser(User):
    # @task가 끝날때마다 다음 @task 실행 전까지 1~3초 랜덤하게 쉼. 요청이 기계적으로 몰리지 않게 하기 위해서.
    wait_time = between(1, 3)

    # on_start는 Locust가 가상 사용자를 스폰할 때 딱 한 번 호출하는 훅이다.
    # 여기서 '로그인 -> 방 목록 조회 -> WS 연결까지' 핵심 플로우의 앞부분을 순서대로 실행함.
    def on_start(self):
        account = next_account()
        self.username = account["username"]
        self.ws = None
        self._running = False
        self._ping_sent_at = None
        self.token = None

        response = self._rest(
            method="POST", path="/auth/login", json={"email": account["email"], "password": account["password"]}
        )
        response.raise_for_status()
        self.token = response.json()["access_token"]

        self._rest(method="GET", path="/rooms")
        self._rest(method="GET", path="/rooms/dm")

        self._connect_ws()
        if self.ws:
            self._running = True
            # _receive_loop, _heartbeat_loop 따로 띄우는 이유:
            # on_start가 실행되는 메인 흐름은 로그인 -> 방 조회 -> ws 연결까지 하고 나면 끝나고,
            # 그 다음부터는 @task(send_message)가 wait_time마다 반복 호출되는 사이클로 넘어간다.
            # 그런데 heartbeat는 메인 @task 사이클과 전혀 다른 타이밍으로 계속 돌아야 하는 별개의 작업.
            self.receiver_greenlet = gevent.spawn(self._receive_loop)
            self.heartbeat_greenlet = gevent.spawn(self._heartbeat_loop)

    # 연결 정리
    def on_stop(self):
        self._running = False
        if self.ws:
            self.ws.close()

    # REST 호출 헬퍼와 통계 기록(_fire)
    def _rest(self, method: str, path: str, json: dict | None = None) -> requests.Response:
        start = time.perf_counter()
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else None

        response = requests.request(method, f"{self.host}{path}", headers=headers, json=json)

        self._fire("REST", path, start, response.ok, response.status_code)
        return response

    # 통계 기록
    # HttpUser를 썼다면 self.client.get(...) 이 기록을 알아서 해주는데,
    # User라는 빈 베이스 클래스를 쓰고 있어서, Locust 대시보드에 뭔가 보이게 하려면 직접 이 이벤트를 쏴줘야 함.
    def _fire(self, request_type: str, name: str, start: float, success: bool, status_code: int) -> None:
        events.request.fire(
            request_type=request_type,
            name=name,
            response_time=(time.perf_counter() - start) * 1000,  # 단위:ms
            response_length=0,
            exception=None if success else Exception(f"status={status_code}"),
        )

    # WebSocket 연결
    def _connect_ws(self):
        ws_url = self.host.replace("http://", "ws://").replace("https://", "wss://")
        start = time.perf_counter()
        try:
            # handshake 수행 부분
            self.ws = websocket.create_connection(f"{ws_url}/ws?token={self.token}", timeout=10)
            self._fire("WS", "connect", start, True, 101)
        except Exception:
            self.ws = None
            self._fire("WS", "connect", start, False, 0)

    # 수신 루프
    def _receive_loop(self):
        while self._running and self.ws:
            try:
                raw = self.ws.recv()
            except Exception:
                break

            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if payload.get("type") == "pong" and self._ping_sent_at is not None:
                self._fire("WS", "ping", self._ping_sent_at, True, 200)
                self._ping_sent_at = None
            elif payload.get("type") == "error":
                events.request.fire(
                    request_type="WS",
                    name="error",
                    response_time=0,
                    response_length=0,
                    exception=Exception(payload.get("detail", "unknown error")),
                )

    def _heartbeat_loop(self):
        while self._running and self.ws:
            gevent.sleep(HEARTBEAT_INTERVAL)
            if not self.ws:
                break

            self._ping_sent_at = time.perf_counter()
            try:
                self.ws.send(json.dumps({"type": "ping"}))
            except Exception:
                break

    # @task로 표시한 메서드가 Locust가 반복 호출하는 대상.
    @task
    def send_message(self):
        if not self.ws:
            return

        try:
            self.ws.send(
                json.dumps(
                    {
                        "type": "message.send",
                        "room_id": ROOM_ID,
                        "content": f"부하테스트 메세지 {random.randint(1, 100000)}",
                    }
                )
            )

            events.request.fire(
                request_type="WS",
                name="message.send",
                response_time=0,
                response_length=0,
                exception=None,
            )
        except Exception as e:
            events.request.fire(
                request_type="WS",
                name="message.send",
                response_time=0,
                response_length=0,
                exception=e,
            )
