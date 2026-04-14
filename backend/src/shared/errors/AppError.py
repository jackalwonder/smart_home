from __future__ import annotations

from src.shared.errors.ErrorCode import ErrorCode


class AppError(Exception):
    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
