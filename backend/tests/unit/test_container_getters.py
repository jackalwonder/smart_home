from __future__ import annotations

from importlib import import_module

import src.app.container as container


DOMAIN_GETTER_MODULES = (
    "src.app.container_getters.auth",
    "src.app.container_getters.backups",
    "src.app.container_getters.core",
    "src.app.container_getters.device_control",
    "src.app.container_getters.devices",
    "src.app.container_getters.editor",
    "src.app.container_getters.energy",
    "src.app.container_getters.media",
    "src.app.container_getters.overview",
    "src.app.container_getters.page_assets",
    "src.app.container_getters.realtime",
    "src.app.container_getters.settings",
    "src.app.container_getters.system",
    "src.app.container_getters.unit_of_work",
)


def test_container_reexports_domain_getters_for_controller_compatibility() -> None:
    exported_getters: set[str] = set()

    for module_name in DOMAIN_GETTER_MODULES:
        module = import_module(module_name)
        for getter_name in module.__all__:
            exported_getters.add(getter_name)
            assert getattr(container, getter_name) is getattr(module, getter_name)

    assert set(container.__all__) == exported_getters
