# 《家庭智能中控 Web App Repository 接口定义代码骨架 v2.4.1》

## 一、文档信息

- 文档名称：家庭智能中控 Web App Repository 接口定义代码骨架 v2.4.1
- 文档类型：工程实施配套文档 / Repository 接口代码骨架
- 适用对象：后端、测试、Codex 任务拆解
- 编制日期：2026-04-16
- 版本状态：已冻结（实施版）
- 基线文档：
  - 《家庭智能中控 Web App Repository 接口与读写分层定义 v2.4》
  - 《家庭智能中控 Web App 后端模块骨架与目录设计 v2.4.1》
  - 《家庭智能中控 Web App PostgreSQL 首版 DDL v2.4》

---

## 二、修订目标（v2.4.1）

1. 将原 TypeScript 接口骨架统一为 Python 3.12 风格。
2. Repository 抽象统一采用 `typing.Protocol`。
3. 保持 v2.4 业务语义不变：`request_id` 幂等、lease 约束、outbox 规则、Save All/Publish 分离。

---

## 三、文件布局（Python）

```text
src/
  shared/
    kernel/
      repo_context.py
      unit_of_work.py
      clock.py
      id_generator.py
      version_token_generator.py
      event_id_generator.py
  infrastructure/
    capabilities/
      provider.py
    weather/
      provider.py
    ha/
      control_gateway.py
      connection_gateway.py
  repositories/
    rows/
      models.py
    read_models/
      models.py
    base/
      auth/
      devices/
      settings/
      editor/
      control/
      realtime/
      backups/
      audit/
    query/
      auth/
      overview/
      settings/
      editor/
      control/
      backups/
```

---

## 四、shared/kernel 代码骨架

### 4.1 `repo_context.py`

```python
from dataclasses import dataclass
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

@dataclass(slots=True)
class RepoContext:
    session: AsyncSession | None = None
    now: datetime | None = None
```

### 4.2 `unit_of_work.py`

```python
from collections.abc import Awaitable, Callable
from typing import Protocol, TypeVar

T = TypeVar("T")

class UnitOfWork(Protocol):
    async def run_in_transaction(self, fn: Callable[[], Awaitable[T]]) -> T: ...
```

### 4.3 `clock.py` / `id_generator.py`

```python
from datetime import datetime
from typing import Protocol

class Clock(Protocol):
    def now(self) -> datetime: ...

class IdGenerator(Protocol):
    def next_id(self) -> str: ...
```

### 4.4 `version_token_generator.py` / `event_id_generator.py`

```python
from typing import Protocol

class VersionTokenGenerator(Protocol):
    def next_settings_version(self) -> str: ...
    def next_layout_version(self) -> str: ...
    def next_draft_version(self) -> str: ...

class EventIdGenerator(Protocol):
    def next_event_id(self) -> str: ...
```

---

## 五、Provider / Gateway 骨架

### 5.1 Capability Provider

```python
from dataclasses import dataclass
from typing import Protocol

@dataclass(slots=True)
class CapabilitySnapshot:
    energy_enabled: bool
    editor_enabled: bool

class CapabilityProvider(Protocol):
    async def get_capabilities(self, home_id: str) -> CapabilitySnapshot: ...
```

### 5.2 Weather Provider

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

@dataclass(slots=True)
class WeatherSnapshot:
    temperature: float | None
    condition: str | None
    humidity: float | None
    fetched_at: datetime
    cache_mode: bool

class WeatherProvider(Protocol):
    async def get_sidebar_weather(self, home_id: str) -> WeatherSnapshot | None: ...
```

### 5.3 HA Gateway

```python
from dataclasses import dataclass, field
from typing import Any, Protocol

@dataclass(slots=True)
class HaControlCommand:
    home_id: str
    device_id: str
    request_id: str
    action_type: str
    payload: dict[str, Any] = field(default_factory=dict)

@dataclass(slots=True)
class HaConnectionTestResult:
    success: bool
    status: str
    message: str | None = None

class HaControlGateway(Protocol):
    async def submit_control(self, command: HaControlCommand) -> None: ...

class HaConnectionGateway(Protocol):
    async def test_connection(self, base_url: str, auth_payload: dict[str, Any]) -> HaConnectionTestResult: ...
    async def trigger_full_reload(self, home_id: str) -> None: ...
```

---

## 六、行模型与读模型骨架

### 6.1 `repositories/rows/models.py`（SQLAlchemy 2.0 示例）

```python
from datetime import datetime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class DeviceControlRequestRow(Base):
    __tablename__ = "device_control_requests"
    id: Mapped[str] = mapped_column(primary_key=True)
    home_id: Mapped[str]
    request_id: Mapped[str]
    device_id: Mapped[str]
    action_type: Mapped[str]
    acceptance_status: Mapped[str]
    execution_status: Mapped[str]
    accepted_at: Mapped[datetime | None]
    completed_at: Mapped[datetime | None]

class DraftLeaseRow(Base):
    __tablename__ = "draft_leases"
    id: Mapped[str] = mapped_column(primary_key=True)
    home_id: Mapped[str]
    lease_id: Mapped[str]
    terminal_id: Mapped[str]
    lease_status: Mapped[str]
    is_active: Mapped[bool]
    lease_expires_at: Mapped[datetime]
    last_heartbeat_at: Mapped[datetime]
```

### 6.2 `repositories/read_models/models.py`（Pydantic v2 示例）

```python
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict

class DeviceControlResultReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    request_id: str
    device_id: str
    acceptance_status: str
    execution_status: str
    final_runtime_state: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
    accepted_at: datetime | None = None
    completed_at: datetime | None = None

class DraftLeaseReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    lease_id: str
    terminal_id: str
    member_id: str | None = None
    lease_status: str
    is_active: bool
    lease_expires_at: datetime
    last_heartbeat_at: datetime
```

---

## 七、Base Repository 接口骨架（Protocol）

### 7.1 认证域

```python
from datetime import datetime
from typing import Protocol
from shared.kernel.repo_context import RepoContext

class HomeRepository(Protocol):
    async def find_by_id(self, home_id: str, ctx: RepoContext | None = None): ...

class TerminalRepository(Protocol):
    async def find_by_id(self, terminal_id: str, ctx: RepoContext | None = None): ...
    async def find_by_code(self, home_id: str, terminal_code: str, ctx: RepoContext | None = None): ...
    async def touch_last_seen(
        self,
        terminal_id: str,
        seen_at: datetime,
        ip: str | None,
        ctx: RepoContext | None = None,
    ) -> None: ...

class PinSessionRepository(Protocol):
    async def find_active_by_home_and_terminal(self, home_id: str, terminal_id: str, ctx: RepoContext | None = None): ...
    async def insert(self, input_data, ctx: RepoContext | None = None): ...
    async def deactivate_active_by_home_and_terminal(self, home_id: str, terminal_id: str, ctx: RepoContext | None = None) -> int: ...
    async def mark_expired_before(self, now: datetime, ctx: RepoContext | None = None) -> int: ...
```

### 7.2 设备与版本域

```python
from typing import Protocol
from shared.kernel.repo_context import RepoContext

class DeviceRepository(Protocol):
    async def find_by_id(self, home_id: str, device_id: str, ctx: RepoContext | None = None): ...
    async def list_by_home(self, home_id: str, filter_data, ctx: RepoContext | None = None): ...
    async def update_mapping(self, device_id: str, patch, ctx: RepoContext | None = None) -> None: ...

class LayoutVersionRepository(Protocol):
    async def find_current_by_home(self, home_id: str, ctx: RepoContext | None = None): ...
    async def insert(self, input_data, ctx: RepoContext | None = None): ...

class SettingsVersionRepository(Protocol):
    async def find_current_by_home(self, home_id: str, ctx: RepoContext | None = None): ...
    async def insert(self, input_data, ctx: RepoContext | None = None): ...
```

### 7.3 编辑锁、控制、outbox 域

```python
from datetime import datetime
from typing import Protocol
from shared.kernel.repo_context import RepoContext

class DraftLeaseRepository(Protocol):
    async def find_active_by_home_id(self, home_id: str, ctx: RepoContext | None = None): ...
    async def find_by_lease_id(self, home_id: str, lease_id: str, ctx: RepoContext | None = None): ...
    async def insert(self, input_data, ctx: RepoContext | None = None): ...
    async def deactivate_lease(
        self,
        lease_id: str,
        next_status: str,
        lost_reason: str | None,
        ctx: RepoContext | None = None,
    ) -> None: ...
    async def heartbeat(
        self,
        lease_id: str,
        heartbeat_at: datetime,
        expires_at: datetime,
        ctx: RepoContext | None = None,
    ) -> int: ...

class DeviceControlRequestRepository(Protocol):
    async def find_by_request_id(self, home_id: str, request_id: str, ctx: RepoContext | None = None): ...
    async def insert(self, input_data, ctx: RepoContext | None = None): ...
    async def update_execution_result(self, input_data, ctx: RepoContext | None = None) -> None: ...

class WsEventOutboxRepository(Protocol):
    async def insert(self, input_data, ctx: RepoContext | None = None): ...
    async def list_pending(self, limit: int, ctx: RepoContext | None = None): ...
    async def mark_dispatching(self, ids: list[str], ctx: RepoContext | None = None) -> None: ...
    async def mark_dispatched(self, item_id: str, ctx: RepoContext | None = None) -> None: ...
    async def mark_failed(self, item_id: str, ctx: RepoContext | None = None) -> None: ...
```

---

## 八、Query Repository 接口骨架（Protocol）

```python
from datetime import datetime
from typing import Protocol
from shared.kernel.repo_context import RepoContext

class AuthSessionQueryRepository(Protocol):
    async def get_auth_session_context(
        self,
        home_id: str,
        terminal_id: str,
        now: datetime,
        ctx: RepoContext | None = None,
    ): ...

class HomeOverviewQueryRepository(Protocol):
    async def get_overview_context(self, home_id: str, ctx: RepoContext | None = None): ...

class SettingsSnapshotQueryRepository(Protocol):
    async def get_current_settings_snapshot(self, home_id: str, ctx: RepoContext | None = None): ...

class EditorDraftQueryRepository(Protocol):
    async def get_draft_context(self, home_id: str, ctx: RepoContext | None = None): ...

class EditorLeaseQueryRepository(Protocol):
    async def get_lease_context(
        self,
        home_id: str,
        terminal_id: str,
        now: datetime,
        ctx: RepoContext | None = None,
    ): ...

class DeviceControlQueryRepository(Protocol):
    async def get_control_result(self, home_id: str, request_id: str, ctx: RepoContext | None = None): ...

class BackupQueryRepository(Protocol):
    async def list_backups(self, home_id: str, ctx: RepoContext | None = None): ...
```

---

## 九、事务与一致性约束（不变）

### 9.1 Save All

事务内固定顺序：校验当前 `settings_version` -> 生成新版本 -> 写 favorites/page/function -> 写审计 -> 写 `settings_updated` outbox。

### 9.2 Publish

事务内固定顺序：校验 `lease_id + draft_version + base_layout_version` -> 生成新 `layout_version` -> 写热点 -> 释放 lease -> 写审计 -> 写 `publish_succeeded` outbox。

### 9.3 备份恢复

恢复必须生成新的 `settings_version` 与 `layout_version`，并写 `backup_restore_completed` outbox，不得覆盖旧版本。

### 9.4 控制幂等与事件幂等

1. `device_control_requests(home_id, request_id)` 唯一约束。
2. `ws_event_outbox(home_id, event_id)` 唯一约束。
3. 事件写入与业务写入同事务提交。

---

## 十、命名约定（Python）

```text
接口：
  device_repository.py
  home_overview_query_repository.py
  ws_event_outbox_repository.py

实现：
  sqlalchemy_device_repository.py
  sqlalchemy_home_overview_query_repository.py
  sqlalchemy_ws_event_outbox_repository.py
```

禁止：

1. `common_repository.py`
2. `base_repo_impl.py`
3. `xxx_service` 直接引用裸 SQL

---

## 十一、首批优先落地接口

第一优先级：

1. `UnitOfWork`
2. `HomeRepository`
3. `TerminalRepository`
4. `PinSessionRepository`
5. `AuthSessionQueryRepository`
6. `DeviceRepository`
7. `DeviceRuntimeStateRepository`
8. `LayoutVersionRepository`
9. `SettingsVersionRepository`
10. `HomeOverviewQueryRepository`
11. `DeviceControlRequestRepository`
12. `WsEventOutboxRepository`

第二优先级：

1. `SettingsSnapshotQueryRepository`
2. `DraftLeaseRepository`
3. `EditorDraftQueryRepository`
4. `EditorLeaseQueryRepository`
5. `DeviceControlQueryRepository`

---

## 十二、结论

v2.4.1 Repository 接口骨架已完成 Python/FastAPI 口径统一；后续可直接按本骨架生成真实 `.py` 文件与 SQLAlchemy 实现，无需再保留 `.ts` 形式的后端正式骨架。
