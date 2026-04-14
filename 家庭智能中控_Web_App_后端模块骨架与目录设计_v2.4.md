# 《家庭智能中控 Web App 后端模块骨架与目录设计 v2.4》

## 一、文档信息

- 文档名称：家庭智能中控 Web App 后端模块骨架与目录设计 v2.4
- 文档类型：工程实施配套文档 / 后端骨架实施设计
- 适用对象：后端、测试、Codex 任务拆解
- 编制日期：2026-04-14
- 版本状态：已冻结（实施版）
- 基线文档：
  - 《家庭智能中控 Web App PRD v2.4》
  - 《家庭智能中控 Web App 接口清单 v2.4》
  - 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
  - 《家庭智能中控 Web App 数据库模型初稿 v2.4》
  - 《家庭智能中控 Web App 数据库 ER 图与关系说明 v2.4》
  - 《家庭智能中控 Web App 后端接口实现映射表 v2.4》
  - 《家庭智能中控 Web App PostgreSQL 首版 DDL v2.4》
  - 《家庭智能中控 Web App Repository 接口草案与读写分层定义 v2.4》

---

## 二、文档目标

本文件解决的是“后端代码第一版应该怎么搭起来”：

1. 模块怎么拆。
2. 目录怎么落。
3. Controller / Service / Repository / Provider / Gateway 分别放哪里。
4. 哪些模块可以独立开发，哪些模块必须共享公共基础层。
5. 第一批骨架文件应该有哪些，便于直接开始编码。

本文件不定义：

1. 具体框架实现语法。
2. ORM 细节。
3. 第三方 SDK 细节。

---

## 三、总体架构原则

### 3.1 按业务能力拆模块

模块优先按业务域拆分，而不是按技术层拆成全局 `controllers/services/repositories` 三大目录。原因：

1. 首页总览、控制、设置、编辑态的业务边界已经冻结。
2. 同一业务域内更适合收敛 DTO、Service、Policy、Assembler。
3. 后续代码评审、测试和迭代更容易按模块推进。

### 3.2 公共基础能力下沉到 shared / infrastructure

以下能力不得散落到业务模块内部重复实现：

1. 数据库连接与事务。
2. Repository 实现基类。
3. 统一响应体适配。
4. 统一错误码映射。
5. 时间、ID、序列号、版本号生成。
6. WS outbox dispatcher。
7. Feature capability / Weather provider / HA adapter。

### 3.3 Query 和 Command 分离

1. 查询接口优先走 Query Service + Query Repository。
2. 写接口优先走 Command Service + Command Repository。
3. 不在 Controller 中手工拼仓储。
4. 不在 Repository 中组装 HTTP 返回体。

### 3.4 事务边界只允许在 Application Service 层

1. Controller 不开事务。
2. Repository 不开跨领域事务。
3. `UnitOfWork` 只由 Application Service 持有。

### 3.5 Provider 与 Repository 职责分离

1. Repository 只管数据库。
2. Provider 负责外部依赖和部署级能力，如天气、能力开关、HA 网关、文件存储。
3. Query Service 聚合数据库结果和 Provider 结果。

---

## 四、目录总览

统一采用如下目录结构：

```text
backend/
  src/
    app/
      bootstrap/
      config/
      container/
      routing/
    shared/
      kernel/
      errors/
      response/
      logging/
      auth/
      time/
      ids/
      pagination/
      validation/
    infrastructure/
      db/
        connection/
        unit_of_work/
        mappers/
        repositories/
          base/
          query/
          command/
      outbox/
      ws/
      weather/
      capabilities/
      ha/
      storage/
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

说明：

1. `app/` 放应用启动和依赖装配。
2. `shared/` 放全局稳定基础能力。
3. `infrastructure/` 放数据库、外部服务、WS dispatcher 等技术实现。
4. `modules/` 放业务模块。
5. `tests/` 与业务代码同结构镜像组织。

---

## 五、模块内标准目录

每个业务模块统一采用以下结构：

```text
modules/<module_name>/
  controllers/
  services/
    query/
    command/
  dto/
    request/
    response/
  assemblers/
  policies/
  types/
  index.ts
```

说明：

1. `controllers/` 只做参数接收、认证上下文接入、调用 service、返回统一响应体。
2. `services/query/` 和 `services/command/` 对应 Repository 设计里的读写分离。
3. `dto/` 放接口入参出参结构。
4. `assemblers/` 负责从读模型组装为接口响应体。
5. `policies/` 放模块内校验规则和决策逻辑，如编辑锁判断、控制参数校验、收藏筛选规则。
6. `types/` 放模块内领域类型。

---

## 六、shared 层目录定义

## 6.1 `shared/kernel/`

职责：

1. 全局公共接口。
2. `UseCase` / `Handler` / `RepoContext` / `Clock` / `IdGenerator` 等基础抽象。

标准文件：

```text
shared/kernel/
  RepoContext.ts
  UnitOfWork.ts
  Clock.ts
  IdGenerator.ts
  SequenceGenerator.ts
```

## 6.2 `shared/errors/`

职责：

1. 统一业务异常定义。
2. 统一错误码到响应体映射。

标准文件：

```text
shared/errors/
  AppError.ts
  ErrorCode.ts
  ErrorMapper.ts
  HttpErrorTranslator.ts
```

## 6.3 `shared/response/`

职责：

1. 包装统一响应体。
2. 写入 `request_id`、`server_time`、`version` 等公共字段。

标准文件：

```text
shared/response/
  ResponseEnvelope.ts
  SuccessResponseFactory.ts
  ErrorResponseFactory.ts
```

## 6.4 `shared/auth/`

职责：

1. 家庭上下文、终端上下文、PIN 会话上下文解析。
2. 提供 Guard / Decorator / Middleware 的统一实现位置。

标准文件：

```text
shared/auth/
  AuthContext.ts
  TerminalContext.ts
  PinSessionGuard.ts
  AdminProtectionPolicy.ts
```

## 6.5 `shared/time/` 与 `shared/ids/`

职责：

1. 时间与 ID 生成统一注入。
2. 测试替身可控。

建议文件：

```text
shared/time/SystemClock.ts
shared/ids/UuidGenerator.ts
shared/ids/VersionTokenGenerator.ts
shared/ids/EventIdGenerator.ts
shared/ids/RequestIdValidator.ts
```

---

## 七、infrastructure 层目录定义

## 7.1 `infrastructure/db/`

职责：

1. 数据库连接。
2. `UnitOfWork` 实现。
3. Repository 具体实现。
4. 表行模型与领域模型映射。

接口层目录约定：

1. Repository 接口统一放在 `src/repositories/base` 与 `src/repositories/query`。
2. `infrastructure/db/repositories/base|query|command` 只放具体实现，不重复定义接口。

标准结构：

```text
infrastructure/db/
  connection/
    DbClient.ts
    DbPool.ts
  unit_of_work/
    PostgresUnitOfWork.ts
  mappers/
    row_to_domain/
    domain_to_row/
  repositories/
    base/
    query/
    command/
```

## 7.2 `infrastructure/outbox/`

职责：

1. 拉取 `ws_event_outbox` 待分发事件。
2. 推进 `delivery_status`。
3. 调度 WS 广播。

建议文件：

```text
infrastructure/outbox/
  OutboxDispatcher.ts
  OutboxPoller.ts
  OutboxEventMapper.ts
```

## 7.3 `infrastructure/ws/`

职责：

1. WebSocket 连接管理。
2. `sequence`、重连补偿、snapshot 补偿。

建议文件：

```text
infrastructure/ws/
  WsConnectionRegistry.ts
  WsEventPublisher.ts
  WsSequenceService.ts
```

## 7.4 `infrastructure/weather/`

职责：

1. 外部天气源调用。
2. 短 TTL 缓存。

建议文件：

```text
infrastructure/weather/
  WeatherProvider.ts
  CachedWeatherProvider.ts
```

## 7.5 `infrastructure/capabilities/`

职责：

1. 部署级 capability。
2. 家庭级 capability 覆盖整合。

建议文件：

```text
infrastructure/capabilities/
  CapabilityProvider.ts
  EnvCapabilityProvider.ts
```

## 7.6 `infrastructure/ha/`

职责：

1. HA 连接测试。
2. 设备全量同步。
3. 实时事件消费。
4. 降级轮询。

建议文件：

```text
infrastructure/ha/
  HaClient.ts
  HaSyncRunner.ts
  HaEventSubscriber.ts
  HaStateMapper.ts
```

## 7.7 `infrastructure/storage/`

职责：

1. 户型图资源存储。
2. 备份快照存储。

建议文件：

```text
infrastructure/storage/
  FileStorage.ts
  BackupStorage.ts
```

---

## 八、业务模块设计

## 8.1 `modules/auth/`

职责：

1. `GET /auth/session`
2. `POST /auth/pin/verify`
3. `GET /auth/pin/session`

标准结构：

```text
modules/auth/
  controllers/
    AuthController.ts
  services/
    query/
      SessionQueryService.ts
    command/
      PinVerificationService.ts
  dto/
    request/
      VerifyPinRequest.ts
    response/
      AuthSessionResponse.ts
      PinVerifyResponse.ts
  assemblers/
    AuthSessionAssembler.ts
```

依赖：

1. `AuthSessionQueryRepository`
2. `PinSessionRepository`
3. `PinLockRepository`
4. `CapabilityProvider`

## 8.2 `modules/home_overview/`

职责：

1. `GET /home/overview`
2. `GET /home/panels/{panel_type}`

标准结构：

```text
modules/home_overview/
  controllers/
    HomeOverviewController.ts
  services/
    query/
      HomeOverviewQueryService.ts
      PanelQueryService.ts
  dto/
    response/
      HomeOverviewResponse.ts
      PanelDevicesResponse.ts
  assemblers/
    HomeOverviewAssembler.ts
```

依赖：

1. `HomeOverviewQueryRepository`
2. `PanelQueryRepository`
3. `WeatherProvider`

说明：

1. 天气只在此模块补齐，不下沉到 Repository。

## 8.3 `modules/rooms_devices/`

职责：

1. `GET /rooms`
2. `GET /devices`
3. `GET /devices/{device_id}`
4. `PUT /device-mappings/{device_id}`

建议结构：

```text
modules/rooms_devices/
  controllers/
    RoomsController.ts
    DevicesController.ts
  services/
    query/
      RoomQueryService.ts
      DeviceQueryService.ts
    command/
      DeviceMappingService.ts
  dto/
    request/
      UpdateDeviceMappingRequest.ts
    response/
      RoomListResponse.ts
      DeviceListResponse.ts
      DeviceDetailResponse.ts
```

## 8.4 `modules/device_control/`

职责：

1. `POST /device-controls`
2. `GET /device-controls/{request_id}`

建议结构：

```text
modules/device_control/
  controllers/
    DeviceControlsController.ts
  services/
    query/
      DeviceControlResultQueryService.ts
    command/
      DeviceControlCommandService.ts
  dto/
    request/
      DeviceControlRequest.ts
    response/
      DeviceControlAcceptedResponse.ts
      DeviceControlResultResponse.ts
  policies/
    ControlSchemaPolicy.ts
    ControlIdempotencyPolicy.ts
```

依赖：

1. `DeviceControlRequestRepository`
2. `DeviceControlTransitionRepository`
3. `DeviceControlSchemaRepository`
4. `WsEventOutboxRepository`
5. `HaClient` 或 `HaControlGateway`

## 8.5 `modules/settings/`

职责：

1. `GET /settings`
2. `PUT /settings`
3. `GET /favorites`
4. `GET /page-settings`
5. `GET /function-settings`

建议结构：

```text
modules/settings/
  controllers/
    SettingsController.ts
  services/
    query/
      SettingsQueryService.ts
    command/
      SettingsSaveService.ts
  dto/
    request/
      SaveSettingsRequest.ts
    response/
      SettingsPageResponse.ts
      SaveSettingsResponse.ts
  assemblers/
    SettingsAssembler.ts
  policies/
    SettingsVersionPolicy.ts
```

依赖：

1. `SettingsSnapshotQueryRepository`
2. `SettingsVersionRepository`
3. `FavoriteDeviceRepository`
4. `PageSettingRepository`
5. `FunctionSettingRepository`
6. `WsEventOutboxRepository`

## 8.6 `modules/system_connections/`

职责：

1. `GET /system-connections`
2. `PUT /system-connections/home-assistant`
3. `POST /system-connections/home-assistant/test`
4. `POST /devices/reload`

建议结构：

```text
modules/system_connections/
  controllers/
    SystemConnectionsController.ts
  services/
    query/
      SystemConnectionQueryService.ts
    command/
      SystemConnectionService.ts
      DeviceReloadService.ts
  dto/
    request/
      UpdateHaConnectionRequest.ts
      TestHaConnectionRequest.ts
    response/
      SystemConnectionsResponse.ts
```

## 8.7 `modules/editor/`

职责：

1. `POST /editor/sessions`
2. `GET /editor/draft`
3. `POST /editor/sessions/{lease_id}/heartbeat`
4. `POST /editor/sessions/{lease_id}/takeover`
5. `PUT /editor/draft`
6. `POST /editor/publish`
7. `DELETE /editor/draft`

建议结构：

```text
modules/editor/
  controllers/
    EditorController.ts
  services/
    query/
      EditorDraftQueryService.ts
      EditorLeaseQueryService.ts
    command/
      EditorSessionService.ts
      EditorDraftService.ts
      EditorPublishService.ts
  dto/
    request/
      CreateEditorSessionRequest.ts
      HeartbeatRequest.ts
      TakeoverRequest.ts
      SaveDraftRequest.ts
      PublishDraftRequest.ts
    response/
      EditorSessionResponse.ts
      EditorDraftResponse.ts
      PublishResponse.ts
  policies/
    EditorLeasePolicy.ts
    EditorVersionPolicy.ts
  assemblers/
    EditorDraftAssembler.ts
```

说明：

1. `EditorLeasePolicy` 负责 `lock_status` 推导。
2. `EditorVersionPolicy` 负责 `draft_version` / `base_layout_version` 校验。

## 8.8 `modules/energy/`

职责：

1. `GET /energy`
2. `PUT /energy/binding`
3. `DELETE /energy/binding`
4. `POST /energy/refresh`

建议结构：

```text
modules/energy/
  controllers/
    EnergyController.ts
  services/
    query/
      EnergyQueryService.ts
    command/
      EnergyBindingService.ts
      EnergyRefreshService.ts
  dto/
    request/
      EnergyBindingRequest.ts
    response/
      EnergyResponse.ts
```

## 8.9 `modules/media/`

职责：

1. `GET /media/default`
2. `PUT /media/default/binding`
3. `DELETE /media/default/binding`

建议结构：

```text
modules/media/
  controllers/
    MediaController.ts
  services/
    query/
      DefaultMediaQueryService.ts
    command/
      DefaultMediaBindingService.ts
  dto/
    request/
      UpdateDefaultMediaBindingRequest.ts
    response/
      DefaultMediaResponse.ts
  policies/
    MediaAvailabilityPolicy.ts
```

说明：

1. `MediaAvailabilityPolicy` 负责以运行态优先推导 `availability_status`。

## 8.10 `modules/page_assets/`

职责：

1. `POST /page-assets/floorplan`

建议结构：

```text
modules/page_assets/
  controllers/
    PageAssetsController.ts
  services/
    command/
      FloorplanAssetService.ts
  dto/
    response/
      UploadFloorplanResponse.ts
```

## 8.11 `modules/backups/`

职责：

1. `POST /system/backups`
2. `GET /system/backups`
3. `POST /system/backups/{backup_id}/restore`

建议结构：

```text
modules/backups/
  controllers/
    BackupsController.ts
  services/
    query/
      BackupQueryService.ts
    command/
      BackupService.ts
      BackupRestoreService.ts
  dto/
    request/
      CreateBackupRequest.ts
      RestoreBackupRequest.ts
    response/
      BackupListResponse.ts
      BackupRestoreResponse.ts
```

## 8.12 `modules/realtime/`

职责：

1. `/ws` 网关入口。
2. WS 鉴权、连接注册、断线恢复、sequence。

建议结构：

```text
modules/realtime/
  gateway/
    RealtimeGateway.ts
  services/
    query/
      WsSnapshotQueryService.ts
    command/
      WsSubscribeService.ts
```

## 8.13 `modules/audit/`

职责：

1. 审计写入适配。
2. 对业务模块隐藏具体审计表写法。

建议结构：

```text
modules/audit/
  services/
    command/
      AuditLogService.ts
```

---

## 九、模块之间的依赖方向

强制依赖方向如下：

```text
controllers -> application services -> repositories/providers
assemblers -> dto/response
policies -> shared kernel types
modules -> shared
modules -> infrastructure abstractions
infrastructure implementations -> repository interfaces / provider interfaces
```

禁止：

1. `settings` 直接依赖 `editor`。
2. `editor` 直接依赖 `home_overview`。
3. `device_control` 直接依赖 `settings` 的 DTO。
4. 模块之间互相 import controller。
5. `infrastructure` 反向依赖模块 controller。

允许的共享方式：

1. 通过 `shared/kernel` 抽象。
2. 通过独立 Provider 接口。
3. 通过公共 Repository 接口。

---

## 十、路由装配

统一在 `app/routing/` 做路由注册：

```text
app/routing/
  auth.routes.ts
  home_overview.routes.ts
  rooms_devices.routes.ts
  device_control.routes.ts
  settings.routes.ts
  system_connections.routes.ts
  editor.routes.ts
  energy.routes.ts
  media.routes.ts
  page_assets.routes.ts
  backups.routes.ts
  realtime.routes.ts
```

说明：

1. 路由文件只负责 URL 和 handler 绑定。
2. 不写业务逻辑。

---

## 十一、依赖注入与装配

统一在 `app/container/` 完成依赖注入：

```text
app/container/
  repositories.ts
  providers.ts
  services.ts
  controllers.ts
  gateway.ts
```

装配顺序：

1. 先装数据库连接和 `UnitOfWork`
2. 再装 Base / Query / Command Repository 实现
3. 再装 Provider
4. 再装 Application Service
5. 最后装 Controller / Gateway

理由：

1. 依赖方向清晰。
2. 单元测试时方便替换 Repository 或 Provider 假实现。

---

## 十二、首批骨架文件清单

## 12.1 第一阶段必须创建

```text
src/app/bootstrap/AppFactory.ts
src/shared/kernel/UnitOfWork.ts
src/shared/errors/AppError.ts
src/shared/errors/ErrorCode.ts
src/shared/response/SuccessResponseFactory.ts
src/infrastructure/db/unit_of_work/PostgresUnitOfWork.ts
src/infrastructure/db/repositories/query/AuthSessionQueryRepositoryImpl.ts
src/infrastructure/db/repositories/query/HomeOverviewQueryRepositoryImpl.ts
src/infrastructure/db/repositories/command/DeviceControlRequestRepositoryImpl.ts
src/infrastructure/db/repositories/command/DeviceControlTransitionRepositoryImpl.ts
src/infrastructure/db/repositories/command/WsEventOutboxRepositoryImpl.ts
src/modules/auth/controllers/AuthController.ts
src/modules/auth/services/query/SessionQueryService.ts
src/modules/home_overview/controllers/HomeOverviewController.ts
src/modules/home_overview/services/query/HomeOverviewQueryService.ts
src/modules/device_control/controllers/DeviceControlsController.ts
src/modules/device_control/services/command/DeviceControlCommandService.ts
src/modules/realtime/gateway/RealtimeGateway.ts
```

## 12.2 第二阶段

```text
src/modules/settings/services/query/SettingsQueryService.ts
src/modules/settings/services/command/SettingsSaveService.ts
src/modules/editor/services/query/EditorDraftQueryService.ts
src/modules/editor/services/command/EditorSessionService.ts
src/modules/editor/services/command/EditorPublishService.ts
src/infrastructure/db/repositories/command/SettingsVersionRepositoryImpl.ts
src/infrastructure/db/repositories/command/DraftLeaseRepositoryImpl.ts
src/infrastructure/db/repositories/query/SettingsSnapshotQueryRepositoryImpl.ts
```

## 12.3 第三阶段

```text
src/modules/system_connections/
src/modules/energy/
src/modules/media/
src/modules/backups/
src/infrastructure/ha/
src/infrastructure/weather/
src/infrastructure/capabilities/
```

---

## 十三、测试目录建议

按三层测试组织：

```text
tests/
  unit/
    modules/
    shared/
  integration/
    repositories/
    services/
  contract/
    http/
    ws/
```

说明：

1. `unit/` 重点测 policy、assembler、service 决策分支。
2. `integration/repositories/` 重点测 SQL、事务和唯一约束。
3. `contract/http/` 重点测统一响应体与错误体。
4. `contract/ws/` 重点测最小事件清单和重连补偿。

首批必须覆盖：

1. `request_id` 幂等。
2. 单家庭单活跃 lease。
3. Save All 新版本快照写入。
4. Publish 新正式版本生成。
5. `ws_event_outbox(home_id, event_id)` 幂等。

---

## 十四、实施红线

1. 不允许把所有 service 注册成一个巨型 `ApplicationService`。
2. 不允许把所有仓储实现塞进同一个文件。
3. 不允许模块直接引用 SQL 文件路径做业务判断。
4. 不允许业务模块直接操作底层 DB client，必须经 Repository。
5. 不允许把天气、能力开关、HA 访问混进 Repository。
6. 不允许在 Controller 拼版本冲突、锁冲突、幂等冲突逻辑。
7. 不允许绕过 `UnitOfWork` 直接在多个 Repository 之间做跨表写入。

---

## 十五、落地顺序

1. 先搭 `shared/`、`infrastructure/db/`、`app/container/`。
2. 再搭 `auth / home_overview / device_control / realtime` 四个首批模块。
3. 然后补 `settings / editor`。
4. 最后补 `system_connections / energy / media / backups`。

原因：

1. 先打通首页、控制、WS 主链路，能最早验证 DDL、Repository、统一响应体和 outbox。
2. 之后再进入设置与编辑两个版本域，风险更可控。

---

## 十六、下一步产物

在这份模块骨架文档之后，最合理的下一步是直接输出：

1. 《Repository 接口定义代码骨架 v2.4》
2. 《后端模块代码骨架首批文件内容 v2.4》

如果要更偏实现，可以直接开始生成：

1. `shared/kernel`
2. `UnitOfWork`
3. `Repository interfaces`
4. `AuthController / SessionQueryService`
5. `HomeOverviewController / HomeOverviewQueryService`
6. `DeviceControlsController / DeviceControlCommandService`

---

## 十七、结论

到当前为止，v2.4 的后端实施输入已经完整覆盖：

1. 数据库结构
2. Repository 边界
3. 模块边界
4. 目录设计
5. 事务装配方向
6. 首批骨架文件清单

因此下一步已经不需要再补架构文档，可以直接进入代码骨架生成。
