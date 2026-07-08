from uuid import UUID

import pytest

from app.managers.connection import ConnectionManager


class FakeWS:
    def __init__(self):
        self.sent = []

    async def send_json(self, data):
        self.sent.append(data)


# 1. connect -> is_online
@pytest.mark.asyncio
async def test_connect_and_online():
    connection_manager = ConnectionManager()

    websocket = FakeWS()
    connection_manager.connect(UUID("00000000-0000-0000-0000-000000000001"), websocket)

    assert connection_manager.is_online(UUID("00000000-0000-0000-0000-000000000001")) is True
    assert connection_manager.is_online(UUID("00000000-0000-0000-0000-000000000002")) is False


# disconnect -> is_online False
@pytest.mark.asyncio
async def test_disconnect():
    connection_manager = ConnectionManager()

    user_id = UUID("00000000-0000-0000-0000-000000000001")

    websocket = FakeWS()
    connection_manager.connect(user_id, websocket)
    connection_manager.disconnect(user_id, websocket)

    assert connection_manager.is_online(user_id) is False


# send_to_user -> FakeWS.sent 에 데이터 추가됨
@pytest.mark.asyncio
async def test_send_to_user():
    connection_manager = ConnectionManager()

    user_id = UUID("00000000-0000-0000-0000-000000000001")

    websocket = FakeWS()
    connection_manager.connect(user_id, websocket)
    await connection_manager.send_to_user(user_id, {"type": "test"})

    assert len(websocket.sent) == 1


# braodcast_to_users -> exclude_user_id 는 수신 안함.
@pytest.mark.asyncio
async def test_broadcast_exclude_sender():
    connection_manager = ConnectionManager()

    user_id_sender = UUID("00000000-0000-0000-0000-000000000001")  # 송신자
    user_id_receiver = UUID("00000000-0000-0000-0000-000000000002")  # 수신자

    websocket_1 = FakeWS()
    connection_manager.connect(user_id_sender, websocket_1)

    websocket_2 = FakeWS()
    connection_manager.connect(user_id_receiver, websocket_2)

    await connection_manager.broadcast_to_users(
        user_ids=[user_id_sender, user_id_receiver],
        payload={"type": "test"},
        exclude_user_id=user_id_sender,
    )

    assert len(websocket_1.sent) == 0  # 발신자 제외
    assert len(websocket_2.sent) == 1  # 수신자만
