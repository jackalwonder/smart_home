from __future__ import annotations

from fastapi import APIRouter

from src.app.modules import APP_MODULES, AppModule


def test_app_modules_declare_unique_names_and_routers():
    names = [module.name for module in APP_MODULES]

    assert len(names) == len(set(names))
    assert all(isinstance(module, AppModule) for module in APP_MODULES)
    assert all(module.routers for module in APP_MODULES)
    assert all(
        isinstance(router, APIRouter)
        for module in APP_MODULES
        for router in module.routers
    )
