import pytest
from fastapi import status

from app.core.security import decode_token
from tests.integration.helpers import auth_headers, register_and_get_token


################################################################################################
# POST /rooms 테스트
################################################################################################
# 그룹 채팅방 생성 - 성공
@pytest.mark.asyncio
async def test_create_room_success(client):
    # 회원 가입 후 Authorization 토큰 발급
    headers = await auth_headers(client=client, username="juhee", email="juhee@test.co.kr")

    # 그룹 방 생성
    response = await client.post("/rooms", json={"name": "group_room_1"}, headers=headers)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["is_dm"] is False
    assert response.json()["name"] == "group_room_1"


################################################################################################
# GET /rooms 테스트
################################################################################################
# 내가 속한 방 목록 조회 - 성공
@pytest.mark.asyncio
async def test_get_rooms_success(client):
    # 회원 가입 후 Authorization 토큰 발급
    headers = await auth_headers(client=client, username="juhee", email="juhee@test.co.kr")

    # 그룹 방 생성
    room_1 = await client.post("/rooms", json={"name": "group_room_1"}, headers=headers)
    room_2 = await client.post("/rooms", json={"name": "group_room_2"}, headers=headers)

    # 방 목록 조회
    response = await client.get("/rooms", headers=headers)

    assert response.status_code == status.HTTP_200_OK
    assert len(response.json()) == 2


################################################################################################
# POST /rooms/dm 테스트
################################################################################################
# DM 방 생성 - 성공 (1)
@pytest.mark.asyncio
async def test_create_dm_room(client):
    # 유저
    headers = await auth_headers(client=client, username="juhee", email="juhee@test.co.kr")

    # target 유저
    target_user_token = await register_and_get_token(
        client=client, username="target_user", email="target_user@test.co.kr"
    )

    response = await client.post("/rooms/dm", json={"target_user_id": decode_token(target_user_token)}, headers=headers)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["is_dm"] is True


# DM 방 생성 - 성공 (2) - 같은 상대에게 DM 요청했을 때 동일한 room id 반환
@pytest.mark.asyncio
async def test_create_dm_idempotent(client):
    # 유저
    headers = await auth_headers(client=client, username="juhee", email="juhee@test.co.kr")

    # target 유저
    target_user_token = await register_and_get_token(
        client=client, username="target_user", email="target_user@test.co.kr"
    )

    response_1 = await client.post(
        "/rooms/dm", json={"target_user_id": decode_token(target_user_token)}, headers=headers
    )
    response_2 = await client.post(
        "/rooms/dm", json={"target_user_id": decode_token(target_user_token)}, headers=headers
    )

    assert response_2.status_code == status.HTTP_201_CREATED
    assert response_1.json()["id"] == response_2.json()["id"]


################################################################################################
# POST /rooms/{room_id}/members 테스트
################################################################################################
@pytest.mark.asyncio
async def test_invite_members_success(client):
    # 유저
    headers = await auth_headers(client=client, username="juhee", email="juhee@test.co.kr")

    # target 유저
    target_user_token = await register_and_get_token(
        client=client, username="target_user", email="target_user@test.co.kr"
    )

    # 그룹 방 생성
    group_room = await client.post("/rooms", json={"name": "group_room_1"}, headers=headers)
    group_room_id = group_room.json()["id"]

    # target 유저 초대
    response = await client.post(
        f"/rooms/{group_room_id}/members",
        json={"user_id": decode_token(target_user_token)},
        headers=headers,
    )

    assert response.status_code == status.HTTP_204_NO_CONTENT
