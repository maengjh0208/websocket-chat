from enum import StrEnum
from starlette import status


class ErrorCode(StrEnum):
    # 400
    EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS"
    # 401
    INVALID_TOKEN = "INVALID_TOKEN"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    # 403
    FORBIDDEN = "FORBIDDEN"
    # 404
    USER_NOT_FOUND = "USER_NOT_FOUND"
    ROOM_NOT_FOUND = "ROOM_NOT_FOUND"
    # 500
    INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR"


class AppError(Exception):
    def __init__(self, error_code: ErrorCode, detail: str | None = None, status_code: int = 500):
        self.error_code = error_code
        self.detail = detail
        self.status_code = status_code


class BadRequestError(AppError):
    def __init__(self, error_code: ErrorCode, detail: str | None = None):
        super().__init__(
            error_code=error_code,
            detail=detail,
            status_code=status.HTTP_400_BAD_REQUEST,
        )


class UnauthorizedError(AppError):
    def __init__(self, error_code: ErrorCode, detail: str | None = None):
        super().__init__(
            error_code=error_code,
            detail=detail,
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class ForbiddenError(AppError):
    def __init__(self, error_code: ErrorCode, detail: str | None = None):
        super().__init__(
            error_code=error_code,
            detail=detail,
            status_code=status.HTTP_403_FORBIDDEN,
        )


class NotFoundError(AppError):
    def __init__(self, error_code: ErrorCode, detail: str | None = None):
        super().__init__(
            error_code=error_code,
            detail=detail,
            status_code=status.HTTP_404_NOT_FOUND,
        )


class InternalServerError(AppError):
    def __init__(self, error_code: ErrorCode, detail: str | None = None):
        super().__init__(
            error_code=error_code,
            detail=detail,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
