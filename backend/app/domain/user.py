from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass
class UserEntity:
    id: UUID  # dataclass 필드의 타입힌트는 python 표준 uuid.UUID를 써야 함. sqlalchemy.UUID는 DB 컬럼 정의에서만 쓰는 타입임.
    username: str
    email: str
    created_at: datetime


@dataclass
class UserWithPassword(UserEntity):
    hashed_password: str
