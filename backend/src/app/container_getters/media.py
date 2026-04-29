from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.media.MediaBindingRepositoryImpl import (
    MediaBindingRepositoryImpl,
)
from src.modules.media.services.MediaService import MediaService


def get_media_binding_repository() -> MediaBindingRepositoryImpl:
    return resolve(MediaBindingRepositoryImpl)


def get_media_service() -> MediaService:
    return resolve(MediaService)


__all__ = [
    "get_media_binding_repository",
    "get_media_service",
]

