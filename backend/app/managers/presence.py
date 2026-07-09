from uuid import UUID

from app.core.redis import redis_client

PRESENCE_TTL = 300  # 5분


async def set_online(user_id: UUID) -> None:
    await redis_client.set(f"user:{user_id}:online", 1, ex=PRESENCE_TTL)


async def set_offline(user_id: UUID) -> None:
    await redis_client.delete(f"user:{user_id}:online")


async def is_online(user_id: UUID) -> bool:
    # 존재하면 1 아니면 0
    return await redis_client.exists(f"user:{user_id}:online") == 1


async def get_online_peer_ids(peer_ids: list[UUID]) -> list[UUID]:
    if not peer_ids:
        return []

    keys = [f"user:{user_id}:online" for user_id in peer_ids]
    results = await redis_client.mget(keys)
    return [user_id for user_id, val in zip(peer_ids, results) if val is not None]
