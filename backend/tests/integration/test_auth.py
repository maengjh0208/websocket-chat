import pytest
from starlette import status

# 테스트 함수는 반드시 test_ 로 시작해야 pytest가 인식함
# client 파라미터 -> conftest의 client fixture 자동 주입


################################################################################################
# POST /auth/register 테스트
################################################################################################
# 회원가입 - 성공 케이스
@pytest.mark.asyncio
async def test_register_success(client):
    response = await client.post(
        "/auth/register", json={"username": "juhee", "email": "juhee@test.co.kr", "password": "Aa123456789!"}
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert "access_token" in response.json()


# 회원가입 - 실패 케이스 - 중복 이메일
@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    # 첫 번째 가입
    await client.post(
        "/auth/register", json={"username": "juhee", "email": "juhee@test.co.kr", "password": "Aa123456789!"}
    )

    # 같은 이메일로 두 번째 가입
    response = await client.post(
        "/auth/register", json={"username": "juhee2", "email": "juhee@test.co.kr", "password": "Bb123456789!"}
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST


################################################################################################
# POST /auth/login 테스트
################################################################################################
# 로그인 - 성공 케이스
@pytest.mark.asyncio
async def test_login_success(client):
    # 유저 생성
    await client.post(
        "/auth/register", json={"username": "juhee", "email": "juhee@test.co.kr", "password": "Aa123456789!"}
    )

    # 로그인
    response = await client.post("/auth/login", json={"email": "juhee@test.co.kr", "password": "Aa123456789!"})

    assert response.status_code == status.HTTP_200_OK
    assert "access_token" in response.json()


# 로그인 - 실패 케이스 - 이메일 틀림
@pytest.mark.asyncio
async def test_login_wrong_email(client):
    # 유저 생성
    await client.post(
        "/auth/register", json={"username": "juhee", "email": "juhee@test.co.kr", "password": "Aa123456789!"}
    )

    # 로그인
    response = await client.post("/auth/login", json={"email": "wrongemail@test.co.kr", "password": "Aa123456789!"})

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


# 로그인 - 실패 케이스 - 비밀번호 틀림
@pytest.mark.asyncio
async def test_login_wrong_password(client):
    # 유저 생성
    await client.post(
        "/auth/register", json={"username": "juhee", "email": "juhee@test.co.kr", "password": "Aa123456789!"}
    )

    # 로그인
    response = await client.post("/auth/login", json={"email": "juhee@test.co.kr", "password": "Bb123456789!"})

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
