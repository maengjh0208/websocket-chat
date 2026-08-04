
import json
from pathlib import Path

import requests


BASE_URL = "http://localhost:8000"
TOTAL_USERS = 200
PASSWORD = "LoadTest123!"
ROOM_NAME = "부하테스트방"
OUTPUT_FILE = Path(__file__).parent / "users.json"


def register(username: str, email: str) -> None:
    response = requests.post(
        f"{BASE_URL}/auth/register",
        json={"username": username, "email": email, "password": PASSWORD}
    )
    if response.status_code == 201:
        return

    if response.status_code == 400 and response.json().get("error_code") == "EMAIL_ALREADY_EXISTS":
        return

    response.raise_for_status()


def login(email: str) -> str:
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": PASSWORD}
    )
    response.raise_for_status()

    return response.json()["access_token"]


def get_or_create_room(token: str) -> str:
    headers = {"Authorization": f"Bearer {token}"}

    rooms = requests.get(f"{BASE_URL}/rooms", headers=headers)
    rooms.raise_for_status()

    for room in rooms.json():
        if room["name"] == ROOM_NAME:
            return room["id"]

    created_room = requests.post(f"{BASE_URL}/rooms", headers=headers, json={"name": ROOM_NAME})
    created_room.raise_for_status() # 상태코드가 2xx/3xx 면 통과. 4xx/5xx 이면 예외로 던짐

    return created_room.json()["id"]


def invite_all_loadtest_users(token: str, room_id: str) -> None:
    headers = {"Authorization": f"Bearer {token}"}

    users = requests.get(f"{BASE_URL}/users", headers=headers)
    users.raise_for_status()

    for user in users.json():
        if not user["username"].startswith("loadtest_user_"):
            continue

        requests.post(
            f"{BASE_URL}/rooms/{room_id}/members",
            headers=headers,
            json={"user_id": user["id"]},
        )


def main() -> None:
    accounts = []
    for i in range(1, TOTAL_USERS + 1):
        username = f"loadtest_user_{i:04d}"
        email = f"{username}@test.co.kr"
        register(username, email)
        accounts.append({"username": username, "email": email, "password": PASSWORD})

        print(f"{i}/{TOTAL_USERS} {username} 준비 완료")

    admin_token = login(accounts[0]["email"])
    room_id = get_or_create_room(admin_token)
    invite_all_loadtest_users(admin_token, room_id)

    OUTPUT_FILE.write_text(json.dumps({"room_id": room_id, "users": accounts}, indent=2, ensure_ascii=False))
    print(f"완료: {OUTPUT_FILE} 생성, room_id={room_id}")


if __name__ == "__main__":
    main()

