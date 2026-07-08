import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import room as crud_room
from app.crud import user as crud_user
from app.crud import message as crud_message
from app.managers.connection import manager
from app.db.session import get_session
from app.core.security import decode_token
from app.core.enums import PresenceStatus, WSCloseCode, WSMessageType

router = APIRouter()


async def _broadcast_presence(session: AsyncSession, user_id: UUID, status: str) -> None:
    """
    내가 접속할 때와 끊길 때, 나와 같은 방에 있는 다른 유저들에게 온라인/오프라인 상태를 알려줌
    """
    peer_ids = await crud_room.get_peer_user_ids(session, user_id)

    await manager.broadcast_to_users(
        user_ids=peer_ids,
        payload={
            "type": WSMessageType.PRESENCE_UPDATE,
            "user_id": str(user_id),
            "status": status,
        },
    )


# ws://서버/ws?token= 형태
@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    # WebSocket은 HTTP 헤더를 자유롭게 설정하기 어려움. 따라서 JWT를 쿼리 파라미터로 받음
    token: Annotated[str, Query(..., description="JWT Token")],
):
    # JWT 인증
    try:
        user_id_str = decode_token(token)
    except JWTError:
        # 커스텀 WebSocket 종료 코드 (4000번대는 앱에서 자유롭게 정의 가능함)
        await websocket.close(code=WSCloseCode.UNAUTHORIZED)
        return

    async with get_session() as session:
        user = await crud_user.get_user_by_id(session, user_id_str)
        if not user:
            await websocket.close(code=WSCloseCode.UNAUTHORIZED)
            return

        # 연결 수락 + ConnectionManager 등록
        await websocket.accept()
        manager.connect(user.id, websocket)
        await _broadcast_presence(session=session, user_id=user.id, status=PresenceStatus.ONLINE)

    try:
        # 연결이 살아있는 한 계속 메세지를 기다림
        while True:
            # 클라이언트가 뭔가 보낼 때까지 여기서 블록됨. 코루틴이라 다른 요청을 막지 않음.
            raw = await websocket.receive_text()
            print("3" * 100, flush=True)

            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            async with get_session() as session:
                msg_type = payload.get("type")

                if msg_type == WSMessageType.MESSAGE_SEND:
                    room_id = UUID(payload["room_id"])
                    content = str(payload.get("content", "")).strip()
                    if not content:
                        continue

                    if not await crud_room.is_room_member(session=session, user_id=user.id, room_id=room_id):
                        continue

                    message_id, message_created_at = await crud_message.create_message(
                        session=session,
                        room_id=room_id,
                        user_id=user.id,
                        content=content,
                    )

                    member_ids = await crud_room.get_room_member_ids(session, room_id)

                    await manager.broadcast_to_users(
                        user_ids=member_ids,
                        payload={
                            "type": WSMessageType.MESSAGE_NEW,
                            "id": str(message_id),
                            "room_id": str(room_id),
                            "sender": {"id": str(user.id), "username": user.username},
                            "content": content,
                            "created_at": message_created_at.isoformat(),
                        },
                    )
                elif msg_type in (WSMessageType.TYPING_START, WSMessageType.TYPING_STOP):
                    room_id = UUID(payload["room_id"])
                    is_typing = msg_type == WSMessageType.TYPING_START
                    member_ids = await crud_room.get_room_member_ids(session, room_id)

                    await manager.broadcast_to_users(
                        user_ids=member_ids,
                        payload={
                            "type": WSMessageType.TYPING_INDICATOR,
                            "room_id": str(room_id),
                            "username": user.username,
                            "is_typing": is_typing,
                        },
                        exclude_user_id=user.id,
                    )
                elif msg_type == WSMessageType.READ_UPDATE:
                    room_id = UUID(payload["room_id"])

                    await crud_room.update_last_read_at(
                        session=session,
                        room_id=room_id,
                        user_id=user.id,
                    )

    # 클라이언트가 연결을 끊으면 WebSocketDisconnect 발생해서 except 로 빠짐
    except WebSocketDisconnect:
        manager.disconnect(user.id)
        async with get_session() as session:
            await _broadcast_presence(session=session, user_id=user.id, status=PresenceStatus.OFFLINE)
