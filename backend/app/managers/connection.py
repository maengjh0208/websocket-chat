from uuid import UUID
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # 유저가 접속하면 여기에 추가되고, 접속을 끊으면 제거됨
        self.connections: dict[UUID, WebSocket] = {}

    def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        # 클라이언트가 WebSocket 연결을 맺으면 호출됨. DB나 네트워크 IO가 없으니까 동기(def)로도 충분.
        self.connections[user_id] = websocket

    def disconnect(self, user_id: UUID) -> None:
        # 브라우저를 닫거나 네트워크가 끊기면 호출됨
        self.connections.pop(user_id, None)

    def is_online(self, user_id: UUID) -> bool:
        # 접속 여부.
        return user_id in self.connections

    async def send_to_user(self, user_id: UUID, payload: dict) -> None:
        # 특정 유저에게 메세지 보냄
        websocket = self.connections.get(user_id)
        if websocket is None:
            return

        await websocket.send_json(payload)

    async def broadcast_to_users(
        self,
        user_ids: list[UUID],
        payload: dict,
        exclude_user_id: UUID | None = None,
    ) -> None:
        # 채팅방 멤버 전체에게 메세지 뿌리기
        for user_id in user_ids:
            if user_id == exclude_user_id:
                continue

            await self.send_to_user(user_id, payload)


manager = ConnectionManager()
