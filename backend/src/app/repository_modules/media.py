from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories.base.media.MediaBindingRepositoryImpl import (
    MediaBindingRepositoryImpl,
)


class MediaRepositoryModule(Module):
    @provider
    @singleton
    def provide_media_binding_repository(
        self, db: Database
    ) -> MediaBindingRepositoryImpl:
        return MediaBindingRepositoryImpl(db)
