from __future__ import annotations

from injector import Module, provider, singleton

from src.infrastructure.db.connection.Database import Database
from src.infrastructure.db.repositories.base.page_assets.PageAssetRepositoryImpl import (
    PageAssetRepositoryImpl,
)


class PageAssetRepositoryModule(Module):
    @provider
    @singleton
    def provide_page_asset_repository(self, db: Database) -> PageAssetRepositoryImpl:
        return PageAssetRepositoryImpl(db)
