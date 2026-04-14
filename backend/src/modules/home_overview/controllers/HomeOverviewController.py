from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends, Query

from src.app.container import get_home_overview_query_service
from src.modules.home_overview.services.query.HomeOverviewQueryService import (
    HomeOverviewQueryInput,
    HomeOverviewQueryService,
)

router = APIRouter(prefix="/api/v1/home", tags=["home_overview"])


@router.get("/overview")
async def get_home_overview(
    home_id: str = Query(...),
    service: HomeOverviewQueryService = Depends(get_home_overview_query_service),
) -> dict[str, Any]:
    view = await service.get_overview(HomeOverviewQueryInput(home_id=home_id))
    return {
        "overview": asdict(view.overview),
        "weather": asdict(view.weather) if view.weather is not None else None,
    }
