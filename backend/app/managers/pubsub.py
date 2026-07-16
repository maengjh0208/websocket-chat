import json
from typing import Awaitable, Callable

from app.core.redis import redis_client

CHANNEL = "chat"


async def publish(payload: dict) -> None:
    # Redis는 문자열만 받으므로 payload를 json.dumps로 직렬화함.
    await redis_client.publish(CHANNEL, json.dumps(payload))


async def subscribe(callback: Callable[[dict], Awaitable[None]]) -> None:
    pubsub = redis_client.pubsub()  # Redis Pub/Sub 객체 생성
    await pubsub.subscribe(CHANNEL)  # "chat" 채널 구독 등록

    # pubsub.listen()은 Redis 채널을 계속 바라보는 AsyncGenerator임. 메시지가 올때마다 반복문이 한번 실행됨.
    async for message in pubsub.listen():
        # type 값이 subscribe 일때도 있어서, 실제 데이터가 담긴 메시지만 처리하려면 아래 필터가 필요함.
        if message["type"] == "message":
            data = json.loads(message["data"])
            await callback(data)
