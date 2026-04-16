# 《家庭智能中控 Web App 后端模块骨架与目录设计 v2.4.1》

## 一、文档信息

- 文档名称：家庭智能中控 Web App 后端模块骨架与目录设计 v2.4.1
- 文档类型：工程实施配套文档 / 后端骨架实施设计
- 适用对象：后端、测试、Codex 任务拆解
- 编制日期：2026-04-16
- 版本状态：已冻结（实施版）
- 基线文档：
  - 《家庭智能中控 Web App PRD v2.4》
  - 《家庭智能中控 Web App 接口清单 v2.4》
  - 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
  - 《家庭智能中控 Web App 数据库模型初稿 v2.4》
  - 《家庭智能中控 Web App 数据库 ER 图与关系说明 v2.4》
  - 《家庭智能中控 Web App 后端接口实现映射表 v2.4》
  - 《家庭智能中控 Web App PostgreSQL 首版 DDL v2.4》
  - 《家庭智能中控 Web App Repository 接口与读写分层定义 v2.4》

---

## 二、修订目标（v2.4.1）

本次修订只做工程实现口径统一，不扩展产品范围：

1. 后端骨架统一为 `Python 3.12 + FastAPI + SQLAlchemy 2.0 + Pydantic v2`。
2. 模块拆分、读写分层、事务边界保持 v2.4 冻结语义不变。
3. 不再使用 TypeScript/Nest 风格文件名作为正式后端骨架清单。

---

## 三、冻结不变的业务约束

以下规则在 v2.4.1 与 v2.4 完全一致：

1. Save All 与 Publish 严格分离，分别推进 `settings_version` 与 `layout_version`。
2. Save All 成功后必须写 `settings_updated` 事件。
3. Publish 成功后必须写 `publish_succeeded` 事件。
4. 备份恢复成功后必须写 `backup_restore_completed` 事件。
5. 控制链路继续以 `(home_id, request_id)` 保证幂等。
6. 编辑锁继续保证“单家庭单活跃 lease”，依赖数据库约束兜底。
7. WS 事件必须先写 `ws_event_outbox`，再异步分发，保持事务一致性。

---

## 四、总体架构原则

### 4.1 按业务域拆模块

`auth / home_overview / rooms_devices / device_control / settings / editor / realtime` 等模块独立组织，避免“全局大层目录”耦合。

### 4.2 应用层持有事务边界

仅 `application service` 通过 `UnitOfWork` 开启事务。`router` 与 `repository` 均不跨领域开事务。

### 4.3 Query/Command 分离

1. Query Service + Query Repository 负责读取聚合与读模型。
2. Command Service + Base Repository 负责写入与状态推进。
3. Repository 不组装 HTTP 返回体。

### 4.4 基础能力下沉 shared/infrastructure

统一收敛错误映射、响应外壳、时间/ID 生成、数据库事务、outbox 分发、HA/天气/能力开关。

---

## 五、目录总览（Python 实施版）

```text
backend/
  pyproject.toml
  src/
    app/
      main.py
      bootstrap.py
      container.py
      dependencies.py
      routing/
        auth.py
        home_overview.py
        rooms_devices.py
        device_control.py
        settings.py
        editor.py
        realtime.py
        system_connections.py
        energy.py
        media.py
        page_assets.py
        backups.py
    shared/
      kernel/
        repo_context.py
        unit_of_work.py
        clock.py
        id_generator.py
      errors/
        app_error.py
        error_code.py
        error_mapper.py
      response/
        envelope.py
        success_factory.py
        error_factory.py
      auth/
        auth_context.py
        terminal_context.py
        pin_session_guard.py
    infrastructure/
      db/
        session.py
        models/
        mappers/
        repositories/
          base/
          query/
      outbox/
        dispatcher.py
        poller.py
      ws/
        connection_registry.py
        publisher.py
        sequence_service.py
      capabilities/
        provider.py
      weather/
        provider.py
      ha/
        control_gateway.py
        connection_gateway.py
      storage/
        file_storage.py
        backup_storage.py
    modules/
      auth/
      home_overview/
      rooms_devices/
      device_control/
      settings/
      system_connections/
      editor/
      energy/
      media/
      page_assets/
      backups/
      realtime/
      audit/
  tests/
    unit/
    integration/
    contract/
```

---

## 六、模块内标准结构

```text
modules/<module_name>/
  routers/
  services/
    query/
    command/
  schemas/
    request.py
    response.py
  assemblers/
  policies/
  types.py
```

说明：

1. `routers/` 使用 `APIRouter`，只处理参数解析、鉴权依赖注入、响应包装。
2. `services/` 处理业务编排与事务。
3. `schemas/` 使用 Pydantic v2 定义输入/输出契约。
4. `policies/` 仅放规则推导，不做 IO。

---

## 七、关键基础抽象（Python 风格）

### 7.1 UnitOfWork

```python
from collections.abc import Awaitable, Callable
from typing import Protocol, TypeVar

T = TypeVar("T")

class UnitOfWork(Protocol):
    async def run_in_transaction(self, fn: Callable[[], Awaitable[T]]) -> T: ...
```

### 7.2 RepoContext

```python
from dataclasses import dataclass
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

@dataclass(slots=True)
class RepoContext:
    session: AsyncSession | None = None
    now: datetime | None = None
```

### 7.3 Router 样式

```python
from fastapi import APIRouter, Depends
from modules.settings.schemas.response import SettingsPageData

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])

@router.get("", response_model=SettingsPageData)
async def get_settings(service=Depends(...)) -> SettingsPageData:
    return await service.get_settings_page()
```

---

## 八、路由与依赖装配约定

1. 所有路由统一在 `app/routing/*.py` 注册。
2. 所有依赖统一在 `app/container.py` 装配（repository/provider/service）。
3. `main.py` 仅做 FastAPI app 创建、middleware、router include。

---

## 九、首批骨架文件清单（v2.4.1）

### 9.1 第一阶段必须创建

```text
src/app/main.py
src/app/bootstrap.py
src/shared/kernel/unit_of_work.py
src/shared/errors/app_error.py
src/shared/response/success_factory.py
src/infrastructure/db/session.py
src/infrastructure/db/repositories/query/auth_session_query_repository.py
src/infrastructure/db/repositories/query/home_overview_query_repository.py
src/infrastructure/db/repositories/base/device_control_request_repository.py
src/infrastructure/db/repositories/base/device_control_transition_repository.py
src/infrastructure/db/repositories/base/ws_event_outbox_repository.py
src/modules/auth/routers/auth_router.py
src/modules/auth/services/query/session_query_service.py
src/modules/home_overview/routers/home_overview_router.py
src/modules/home_overview/services/query/home_overview_query_service.py
src/modules/device_control/routers/device_controls_router.py
src/modules/device_control/services/command/device_control_command_service.py
src/modules/realtime/routers/realtime_ws_router.py
```

### 9.2 第二阶段

```text
src/modules/settings/services/query/settings_query_service.py
src/modules/settings/services/command/settings_save_service.py
src/modules/editor/services/query/editor_draft_query_service.py
src/modules/editor/services/command/editor_session_service.py
src/modules/editor/services/command/editor_publish_service.py
src/infrastructure/db/repositories/base/settings_version_repository.py
src/infrastructure/db/repositories/base/draft_lease_repository.py
src/infrastructure/db/repositories/query/settings_snapshot_query_repository.py
```

---

## 十、实施红线

1. 不得把全部业务塞入单个 `ApplicationService`。
2. 不得让模块直接持有 `AsyncSession` 并绕过 Repository。
3. 不得在 Router 中实现版本冲突、锁冲突、幂等冲突判断。
4. 不得在事务提交前直接推送 WebSocket，必须先写 outbox。
5. 不得把 `LOCKED_BY_OTHER / READ_ONLY` 回写到 `draft_leases`。

---

## 十一、结论

v2.4.1 后端骨架已统一为 FastAPI 实施口径，且与 v2.4 业务冻结规则保持一致；后续实现与评审以本文件为后端目录与模块边界基准。
