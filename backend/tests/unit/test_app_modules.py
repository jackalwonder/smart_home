from __future__ import annotations

from fastapi import APIRouter

from src.app.modules import APP_MODULES, AppModule, start_app_modules, stop_app_modules


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


async def test_app_module_lifecycle_hooks_run_in_startup_and_reverse_shutdown_order():
    calls: list[str] = []

    async def start_first() -> None:
        calls.append("start:first")

    async def stop_first() -> None:
        calls.append("stop:first")

    async def start_second() -> None:
        calls.append("start:second")

    async def stop_second() -> None:
        calls.append("stop:second")

    modules = (
        AppModule(
            name="first",
            routers=(),
            startup_hooks=(start_first,),
            shutdown_hooks=(stop_first,),
        ),
        AppModule(
            name="second",
            routers=(),
            startup_hooks=(start_second,),
            shutdown_hooks=(stop_second,),
        ),
    )

    await start_app_modules(modules)
    await stop_app_modules(modules)

    assert calls == ["start:first", "start:second", "stop:second", "stop:first"]
