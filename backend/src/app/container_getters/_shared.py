from __future__ import annotations

from typing import TypeVar

from src.app.injector import get_injector

T = TypeVar("T")

_inj = get_injector()


def resolve(dependency_type: type[T]) -> T:
    return _inj.get(dependency_type)

