from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    username: str = Field(..., description="닉네임")
    email: EmailStr = Field(..., description="이메일")
    password: str = Field(..., description="비밀번호")


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="이메일")
    password: str = Field(..., description="비밀번호")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
