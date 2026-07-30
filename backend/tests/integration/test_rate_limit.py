from fastapi import status
import pytest

from app.core.exceptions import ErrorCode


################################################################################################
# 전역 기본 rate limit
################################################################################################
@pytest.mark.asyncio
async def test_default_rate_limit_applies_globally(client):
    for _ in range(60):
        response = await client.get("/health")
        assert response.status_code == status.HTTP_200_OK

    response = await client.get("/health")
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert response.json()["error_code"] == ErrorCode.RATE_LIMIT_EXCEEDED
