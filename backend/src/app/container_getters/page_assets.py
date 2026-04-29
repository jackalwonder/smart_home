from __future__ import annotations

from src.app.container_getters._shared import resolve
from src.infrastructure.db.repositories.base.page_assets.PageAssetRepositoryImpl import (
    PageAssetRepositoryImpl,
)
from src.modules.page_assets.services.FloorplanAssetService import FloorplanAssetService


def get_page_asset_repository() -> PageAssetRepositoryImpl:
    return resolve(PageAssetRepositoryImpl)


def get_floorplan_asset_service() -> FloorplanAssetService:
    return resolve(FloorplanAssetService)


__all__ = [
    "get_floorplan_asset_service",
    "get_page_asset_repository",
]

