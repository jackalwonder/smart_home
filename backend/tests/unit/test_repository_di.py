from __future__ import annotations

from src.app.injector import get_injector
from src.infrastructure.db.repositories.base.auth.HomeAuthConfigRepositoryImpl import (
    HomeAuthConfigRepositoryImpl,
)
from src.infrastructure.db.repositories.base.backups.BackupRepositoryImpl import (
    BackupRepositoryImpl,
)
from src.infrastructure.db.repositories.base.control.DeviceControlRequestRepositoryImpl import (
    DeviceControlRequestRepositoryImpl,
)
from src.infrastructure.db.repositories.base.devices.DeviceRepositoryImpl import DeviceRepositoryImpl
from src.infrastructure.db.repositories.base.editor.DraftLayoutRepositoryImpl import (
    DraftLayoutRepositoryImpl,
)
from src.infrastructure.db.repositories.base.energy.EnergyAccountRepositoryImpl import (
    EnergyAccountRepositoryImpl,
)
from src.infrastructure.db.repositories.base.media.MediaBindingRepositoryImpl import (
    MediaBindingRepositoryImpl,
)
from src.infrastructure.db.repositories.base.page_assets.PageAssetRepositoryImpl import (
    PageAssetRepositoryImpl,
)
from src.infrastructure.db.repositories.base.realtime.WsEventOutboxRepositoryImpl import (
    WsEventOutboxRepositoryImpl,
)
from src.infrastructure.db.repositories.base.settings.SettingsVersionRepositoryImpl import (
    SettingsVersionRepositoryImpl,
)
from src.infrastructure.db.repositories.base.system.SystemConnectionRepositoryImpl import (
    SystemConnectionRepositoryImpl,
)
from src.infrastructure.db.repositories.query.overview.HomeOverviewQueryRepositoryImpl import (
    HomeOverviewQueryRepositoryImpl,
)
from src.infrastructure.db.unit_of_work.PostgresUnitOfWork import PostgresUnitOfWork


def test_repository_di_resolves_domain_modules_as_singletons() -> None:
    injector = get_injector()
    repository_types = (
        HomeAuthConfigRepositoryImpl,
        HomeOverviewQueryRepositoryImpl,
        SettingsVersionRepositoryImpl,
        DraftLayoutRepositoryImpl,
        DeviceRepositoryImpl,
        DeviceControlRequestRepositoryImpl,
        WsEventOutboxRepositoryImpl,
        SystemConnectionRepositoryImpl,
        EnergyAccountRepositoryImpl,
        MediaBindingRepositoryImpl,
        BackupRepositoryImpl,
        PageAssetRepositoryImpl,
        PostgresUnitOfWork,
    )

    for repository_type in repository_types:
        assert injector.get(repository_type) is injector.get(repository_type)
