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


async def get_all_online_ids() -> list[UUID]:
    user_ids = []

    async for key in redis_client.scan_iter("user:*:online"):
        user_ids.append(UUID(key.split(":")[1]))

    return user_ids
