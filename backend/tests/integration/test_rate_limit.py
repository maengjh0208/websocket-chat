from fastapi import status
import pytest

from app.core.exceptions import ErrorCode
from tests.integration.helpers import auth_headers


################################################################################################
# 전역 기본 rate limit 테스트
################################################################################################
@pytest.mark.asyncio
async def test_default_rate_limit_applies_globally(client):
    for _ in range(60):
        response = await client.get("/health")
        assert response.status_code == status.HTTP_200_OK

    response = await client.get("/health")
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert response.json()["error_code"] == ErrorCode.RATE_LIMIT_EXCEEDED


################################################################################################
# POST /auth/register 제한 (10/minute) 테스트
################################################################################################
@pytest.mark.asyncio
async def test_register_rate_limit(client):
    for i in range(10):
        response = await client.post(
            "/auth/register",
            json={"username": f"user_{i}", "email": f"user_{i}@test.co.kr", "password": "Aa123456789!"},
        )
        assert response.status_code == status.HTTP_201_CREATED

    response = await client.post(
        "/auth/register",
        json={"username": f"user_10", "email": f"user_10@test.co.kr", "password": "Aa123456789!"},
    )
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


################################################################################################
# POST /auth/login 제한 (10/minute) 테스트
################################################################################################
@pytest.mark.asyncio
async def test_login_rate_limit(client):
    await client.post(
        "/auth/register",
        json={"username": "user", "email": "user@test.co.kr", "password": "Aa123456789!"},
    )

    for _ in range(10):
        response = await client.post("/auth/login", json={"email": "user@test.co.kr", "password": "Aa123456789!"})
        assert response.status_code == status.HTTP_200_OK

    response = await client.post("/auth/login", json={"email": "user@test.co.kr", "password": "Aa123456789!"})
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


################################################################################################
# 인증된 요청은 user_id 기준으로 서로 분리되는지 테스트
################################################################################################
@pytest.mark.asyncio
async def test_default_rate_limit_is_isolated_per_user(client):
    header_a = await auth_headers(client=client, username="user_a", email="user_a@test.co.kr")
    header_b = await auth_headers(client=client, username="user_b", email="user_b@test.co.kr")

    for _ in range(60):
        response = await client.get("/users/me", headers=header_a)
        assert response.status_code == status.HTTP_200_OK

    response = await client.get("/users/me", headers=header_a)
    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    # 유저B는 유저A와 별개로 카운터를 가져야 하므로, 정상 응답이어야 함.
    response = await client.get("/users/me", headers=header_b)
    assert response.status_code == status.HTTP_200_OK
