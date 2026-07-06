from httpx import AsyncClient


async def register_and_get_token(client: AsyncClient, username: str, email: str) -> str:
    response = await client.post(
        "/auth/register",
        json={"username": username, "email": email, "password": "password!"},
    )

    return response.json()["access_token"]


async def auth_headers(client: AsyncClient, username: str, email: str) -> dict[str, str]:
    token = await register_and_get_token(client=client, username=username, email=email)

    return {"Authorization": f"Bearer {token}"}
