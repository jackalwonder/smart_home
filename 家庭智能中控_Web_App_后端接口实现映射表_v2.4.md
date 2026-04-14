# 《家庭智能中控 Web App 后端接口实现映射表 v2.4》

## 一、文档信息

- 文档名称：家庭智能中控 Web App 后端接口实现映射表 v2.4
- 文档类型：工程实施配套文档 / 接口落地映射表
- 适用对象：后端、前端联调、测试、Codex 任务拆解
- 编制日期：2026-04-14
- 版本状态：已冻结（实施版）
- 基线文档：
  - 《家庭智能中控 Web App PRD v2.4》
  - 《家庭智能中控 Web App 接口清单 v2.4》
  - 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
  - 《家庭智能中控 Web App 数据库模型初稿 v2.4》
  - 《家庭智能中控 Web App 数据库 ER 图与关系说明 v2.4》

---

## 二、文档目标

本文件把冻结接口清单逐条映射为：

- API / Router
- Service
- Repository
- 主要读写表
- 关键校验点
- 可能触发的 WebSocket 事件
- 审计建议

目标不是给出代码，而是回答下面这些实施问题：

1. 每个接口应该落在哪个后端模块。
2. 一条接口请求应该先到哪个 service，再到哪些 repository。
3. Repository 背后主要操作哪些 tables。
4. 哪些接口需要 PIN、版本号、锁校验、幂等校验。
5. 哪些接口成功后要发 `settings_updated` / `publish_succeeded` / `backup_restore_completed` 等事件。

---

## 三、后端模块划分

| 模块 | 说明 | 典型接口 |
| --- | --- | --- |
| `auth` | 固定家庭账号、PIN 会话、终端级管理保护 | `/auth/session`, `/auth/pin/*` |
| `home_overview` | 首页总览、浮层聚合 | `/home/overview`, `/home/panels/*` |
| `rooms_devices` | 房间列表、设备列表、设备详情、设备映射修正 | `/rooms`, `/devices`, `/device-mappings/*` |
| `device_control` | 控制受理、状态查询、重试、幂等 | `/device-controls*` |
| `settings` | Save All 聚合入口、favorites/page/function 三块配置 | `/settings`, `/favorites`, `/page-settings`, `/function-settings` |
| `system_connections` | HA 连接配置、测试连接、设备重拉 | `/system-connections*`, `/devices/reload` |
| `editor` | Draft/Lease/Heartbeat/Takeover/Publish/Discard | `/editor/*` |
| `energy` | 电量绑定、刷新、快照读取 | `/energy*` |
| `media` | 默认媒体绑定与音乐卡片读取 | `/media/default*` |
| `page_assets` | 户型底图上传 | `/page-assets/floorplan` |
| `backups` | 备份、恢复 | `/system/backups*` |
| `realtime` | WebSocket 建连、事件分发、sequence、snapshot 补偿 | `/ws` |
| `audit` | 审计落库 | 无独立外部接口 |
| `ha_adapter` | HA 事件订阅、全量同步、降级轮询 | 无独立前端接口 |

---

## 四、统一命名

## 4.1 Router / Controller 命名

- `AuthController`
- `HomeOverviewController`
- `RoomsController`
- `DevicesController`
- `DeviceControlsController`
- `SettingsController`
- `SystemConnectionsController`
- `EditorController`
- `EnergyController`
- `MediaController`
- `PageAssetsController`
- `BackupsController`
- `RealtimeGateway`

## 4.2 Service 命名

- `SessionQueryService`
- `PinVerificationService`
- `HomeOverviewQueryService`
- `PanelQueryService`
- `RoomQueryService`
- `DeviceQueryService`
- `DeviceMappingService`
- `DeviceControlCommandService`
- `DeviceControlResultQueryService`
- `SettingsSaveService`
- `SettingsQueryService`
- `SystemConnectionService`
- `DeviceReloadService`
- `EditorSessionService`
- `EditorDraftService`
- `EditorPublishService`
- `EnergyBindingService`
- `EnergyRefreshService`
- `DefaultMediaBindingService`
- `FloorplanAssetService`
- `BackupService`
- `BackupRestoreService`
- `HaSyncMonitorService`
- `WsEventDispatchService`
- `AuditLogService`

## 4.3 Repository 命名

- `HomeRepository`
- `HomeAuthConfigRepository`
- `MemberRepository`
- `TerminalRepository`
- `PinSessionRepository`
- `PinLockRepository`
- `RoomRepository`
- `DeviceRepository`
- `DeviceRuntimeStateRepository`
- `DeviceEntityLinkRepository`
- `DeviceAlertBadgeRepository`
- `DeviceControlSchemaRepository`
- `LayoutVersionRepository`
- `LayoutHotspotRepository`
- `SettingsVersionRepository`
- `FavoriteDeviceRepository`
- `PageSettingRepository`
- `FunctionSettingRepository`
- `SystemConnectionRepository`
- `DraftLayoutRepository`
- `DraftHotspotRepository`
- `DraftLeaseRepository`
- `DeviceControlRequestRepository`
- `DeviceControlTransitionRepository`
- `EnergyAccountRepository`
- `EnergySnapshotRepository`
- `MediaBindingRepository`
- `PageAssetRepository`
- `BackupRepository`
- `AuditLogRepository`
- `WsEventOutboxRepository`
- `HaSyncStatusRepository`

---

## 五、接口映射总表

> 说明：
> - `Service` 列写主协调 service，实际可再拆 query/command 子 service。
> - `Repository` 列只写主要参与者，不强求 1 个接口只进 1 个 repo。
> - `Tables` 列写主要读写表，不列所有 join 细节。

## 5.1 认证与 PIN 会话

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/auth/session` | `AuthController` | `SessionQueryService` | `HomeRepository`, `HomeAuthConfigRepository`, `TerminalRepository`, `PinSessionRepository`, `SettingsVersionRepository`, `FunctionSettingRepository` | `homes`, `home_auth_configs`, `terminals`, `pin_sessions`, `settings_versions`, `function_settings` | 按当前终端聚合 `pin_session_active`、`terminal_mode`、`login_mode` 与功能开关；`features.music_enabled` 取当前生效 `settings_version` 对应的 `function_settings.music_enabled`，`features.energy_enabled / editor_enabled` 由后端 `CapabilityProvider`（部署级 feature flag / 家庭能力开关）提供，不从设置快照反推 | 无 |
| POST | `/api/v1/auth/pin/verify` | `AuthController` | `PinVerificationService` | `HomeAuthConfigRepository`, `PinSessionRepository`, `PinLockRepository`, `TerminalRepository` | `home_auth_configs`, `pin_sessions`, `pin_lock_records`, `terminals` | 校验 PIN、失败次数、锁定时间、`target_action`；活跃 PIN 会话按终端维度维护，不按动作拆多份会话 | 无 |
| GET | `/api/v1/auth/pin/session` | `AuthController` | `PinVerificationService` | `PinSessionRepository`, `PinLockRepository` | `pin_sessions`, `pin_lock_records` | 返回当前终端 PIN 会话是否仍有效 | 无 |

## 5.2 首页总览与浮层

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/home/overview` | `HomeOverviewController` | `HomeOverviewQueryService` | `LayoutVersionRepository`, `LayoutHotspotRepository`, `DeviceRepository`, `DeviceRuntimeStateRepository`, `DeviceAlertBadgeRepository`, `SettingsVersionRepository`, `PageSettingRepository`, `FunctionSettingRepository`, `FavoriteDeviceRepository`, `EnergySnapshotRepository`, `MediaBindingRepository`, `SystemConnectionRepository` | `layout_versions`, `layout_hotspots`, `devices`, `device_runtime_states`, `device_alert_badges`, `settings_versions`, `page_settings`, `function_settings`, `favorite_devices`, `energy_snapshots`, `media_bindings`, `system_connections` | 聚合 `stage + sidebar + quick_entries + energy_bar + system_state`；设置域读取必须先锁定当前生效 `settings_version`，再按该版本快照取 `page_settings / function_settings / favorite_devices`；`sidebar.weather` 不要求关系库建表，默认由后端聚合层通过外部天气源 + 短 TTL 缓存提供；支持 `cache_mode=true` | 无 |
| GET | `/api/v1/home/panels/{panel_type}` | `HomeOverviewController` | `PanelQueryService` | `DeviceRepository`, `DeviceRuntimeStateRepository`, `FavoriteDeviceRepository`, `SettingsVersionRepository` | `devices`, `device_runtime_states`, `favorite_devices`, `settings_versions`, `function_settings` | `panel_type` 只允许 `LIGHTS/ACS/LOW_BATTERY/OFFLINE/FAVORITES` | 无 |

## 5.3 房间与设备

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/rooms` | `RoomsController` | `RoomQueryService` | `RoomRepository`, `DeviceRepository` | `rooms`, `devices` | `include_counts=true` 时聚合设备数 | 无 |
| GET | `/api/v1/devices` | `DevicesController` | `DeviceQueryService` | `DeviceRepository`, `DeviceRuntimeStateRepository`, `DeviceAlertBadgeRepository`, `FavoriteDeviceRepository` | `devices`, `device_runtime_states`, `device_alert_badges`, `favorite_devices`, `rooms` | 支持筛选、分页、候选边界 | 无 |
| GET | `/api/v1/devices/{device_id}` | `DevicesController` | `DeviceQueryService` | `DeviceRepository`, `DeviceRuntimeStateRepository`, `DeviceAlertBadgeRepository`, `DeviceControlSchemaRepository`, `DeviceEntityLinkRepository` | `devices`, `device_runtime_states`, `device_alert_badges`, `device_control_schemas`, `device_entity_links`, `ha_entities` | `is_readonly_device=true` 时 `control_schema=[]` | 无 |
| PUT | `/api/v1/device-mappings/{device_id}` | `DevicesController` | `DeviceMappingService` | `DeviceRepository`, `AuditLogRepository` | `devices`, `audit_logs` | 需 PIN；只允许改房间、类型、主设备、默认聚焦区 | 无 |

## 5.4 控制

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/device-controls` | `DeviceControlsController` | `DeviceControlCommandService` | `DeviceRepository`, `DeviceControlSchemaRepository`, `DeviceControlRequestRepository`, `DeviceControlTransitionRepository`, `AuditLogRepository`, `WsEventOutboxRepository` | `devices`, `device_control_schemas`, `device_control_requests`, `device_control_request_transitions`, `audit_logs`, `ws_event_outbox` | 校验 `request_id`、设备在线、只读、动作/目标/值域；受理成功与最终成功分离 | 后续触发 `device_state_changed` / `media_state_changed` |
| GET | `/api/v1/device-controls/{request_id}` | `DeviceControlsController` | `DeviceControlResultQueryService` | `DeviceControlRequestRepository`, `DeviceControlTransitionRepository` | `device_control_requests`, `device_control_request_transitions` | 只返回业务结果，不用顶层 error 表达 TIMEOUT | 无 |

## 5.5 设置中心聚合与 Save All

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/settings` | `SettingsController` | `SettingsQueryService` | `SettingsVersionRepository`, `FavoriteDeviceRepository`, `PageSettingRepository`, `FunctionSettingRepository`, `SystemConnectionRepository`, `EnergyAccountRepository`, `MediaBindingRepository`, `PinSessionRepository` | `settings_versions`, `favorite_devices`, `page_settings`, `function_settings`, `system_connections`, `energy_accounts`, `media_bindings`, `pin_sessions` | 聚合设置中心总读取；`favorites / page_settings / function_settings` 必须来自同一个当前生效 `settings_version` 快照，`system_settings_summary` 再聚合系统连接、电量绑定、默认媒体绑定状态 | 无 |
| PUT | `/api/v1/settings` | `SettingsController` | `SettingsSaveService` | `SettingsVersionRepository`, `FavoriteDeviceRepository`, `PageSettingRepository`, `FunctionSettingRepository`, `AuditLogRepository`, `WsEventOutboxRepository` | `settings_versions`, `favorite_devices`, `page_settings`, `function_settings`, `audit_logs`, `ws_event_outbox` | 必须校验 `settings_version`；严禁写舞台结构字段；保存时应先生成新 `settings_versions` 记录，再写入关联该版本的快照行 | `settings_updated` |

## 5.6 系统连接与设备重拉

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/system-connections` | `SystemConnectionsController` | `SystemConnectionService` | `SystemConnectionRepository`, `SettingsVersionRepository` | `system_connections`, `settings_versions` | 返回 HA 连接状态、测试结果、同步结果；接口中的 `settings_version` 必须由当前生效 `settings_versions` 读取后补充，不得误认为来自 `system_connections` 表 | 无 |
| PUT | `/api/v1/system-connections/home-assistant` | `SystemConnectionsController` | `SystemConnectionService` | `SystemConnectionRepository`, `AuditLogRepository` | `system_connections`, `audit_logs` | 需 PIN；敏感字段必须以应用层加密后入库 | 无 |
| POST | `/api/v1/system-connections/home-assistant/test` | `SystemConnectionsController` | `SystemConnectionService` | `SystemConnectionRepository` | `system_connections` | 需 PIN；可测试已保存配置或 candidate_config | 无 |
| POST | `/api/v1/devices/reload` | `SystemConnectionsController` | `DeviceReloadService` | `SystemConnectionRepository`, `DeviceRepository`, `DeviceEntityLinkRepository`, `HaSyncStatusRepository`, `AuditLogRepository` | `system_connections`, `devices`, `device_entity_links`, `ha_entities`, `ha_sync_status`, `audit_logs` | 需 PIN；本质是启动一次设备全量同步作业 | 可选 `summary_updated` |

## 5.7 功能设置 / 常用设备 / 页面设置读取

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/function-settings` | `SettingsController` | `SettingsQueryService` | `FunctionSettingRepository`, `SettingsVersionRepository` | `function_settings`, `settings_versions` | 返回当前生效功能设置；必须通过当前 `settings_version` 读取对应快照 | 无 |
| GET | `/api/v1/favorites` | `SettingsController` | `SettingsQueryService` | `FavoriteDeviceRepository`, `DeviceRepository`, `SettingsVersionRepository` | `favorite_devices`, `devices`, `settings_versions` | 支持当前常用设备快照读取；收藏选中结果取自当前 `settings_version` 快照，候选信息由设备域补齐 | 无 |
| GET | `/api/v1/page-settings` | `SettingsController` | `SettingsQueryService` | `PageSettingRepository`, `SettingsVersionRepository` | `page_settings`, `settings_versions` | 返回当前页面设置；必须通过当前 `settings_version` 读取对应快照 | 无 |

## 5.8 编辑态

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/editor/sessions` | `EditorController` | `EditorSessionService` | `DraftLeaseRepository`, `DraftLayoutRepository`, `LayoutVersionRepository`, `WsEventOutboxRepository` | `draft_leases`, `draft_layouts`, `layout_versions`, `ws_event_outbox` | 需 PIN；获取或占用 lease；处理 `takeover_if_locked`；必须依赖 `draft_leases` 上“单家庭单活跃 lease”的数据库级唯一约束，而不是仅靠应用层互斥；持久化层保存 `lease_status`，接口 `lock_status` 由查询层推导 | `draft_lock_acquired` |
| GET | `/api/v1/editor/draft` | `EditorController` | `EditorDraftService` | `DraftLayoutRepository`, `DraftHotspotRepository`, `DraftLeaseRepository` | `draft_layouts`, `draft_hotspots`, `draft_leases` | 可读可写都走此接口；只读态要能返回 `readonly=true`；`draft_version` 表示当前活跃草稿的版本令牌；接口读模型不得把 `LOCKED_BY_OTHER / READ_ONLY` 直接回写到租约表 | 无 |
| POST | `/api/v1/editor/sessions/{lease_id}/heartbeat` | `EditorController` | `EditorSessionService` | `DraftLeaseRepository`, `WsEventOutboxRepository` | `draft_leases`, `ws_event_outbox` | 校验 lease 是否仍归当前终端；失锁时返回专用错误；数据库层仍需保证不存在第二个活跃 lease | `draft_lock_lost`（如失效） |
| POST | `/api/v1/editor/sessions/{lease_id}/takeover` | `EditorController` | `EditorSessionService` | `DraftLeaseRepository`, `WsEventOutboxRepository`, `AuditLogRepository` | `draft_leases`, `ws_event_outbox`, `audit_logs` | 需 PIN；强制接管并让原终端降级只读；旧 lease 失活与新 lease 生效必须在同一事务内完成 | `draft_taken_over`, `draft_lock_lost` |
| PUT | `/api/v1/editor/draft` | `EditorController` | `EditorDraftService` | `DraftLayoutRepository`, `DraftHotspotRepository`, `DraftLeaseRepository` | `draft_layouts`, `draft_hotspots`, `draft_leases` | 校验 `lease_id + draft_version + base_layout_version`；仅保存草稿，不生成正式版本；保存成功后必须推进新的 `draft_version` | 无 |
| POST | `/api/v1/editor/publish` | `EditorController` | `EditorPublishService` | `DraftLayoutRepository`, `DraftHotspotRepository`, `DraftLeaseRepository`, `LayoutVersionRepository`, `LayoutHotspotRepository`, `AuditLogRepository`, `WsEventOutboxRepository` | `draft_layouts`, `draft_hotspots`, `draft_leases`, `layout_versions`, `layout_hotspots`, `audit_logs`, `ws_event_outbox` | 核心接口；生成新 `layout_version`，释放锁；发布时使用同一份当前活跃草稿，不引入第二套 `draft_version` 语义 | `publish_succeeded` |
| DELETE | `/api/v1/editor/draft` | `EditorController` | `EditorDraftService` | `DraftLayoutRepository`, `DraftHotspotRepository`, `DraftLeaseRepository` | `draft_layouts`, `draft_hotspots`, `draft_leases` | 丢弃草稿并释放锁；lease 失活必须满足数据库单活跃约束 | 可选 `draft_lock_lost` |

## 5.9 电量

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/energy` | `EnergyController` | `EnergyRefreshService` | `EnergyAccountRepository`, `EnergySnapshotRepository` | `energy_accounts`, `energy_snapshots` | 读取最新快照；受限态可 `cache_mode=true` | 无 |
| PUT | `/api/v1/energy/binding` | `EnergyController` | `EnergyBindingService` | `EnergyAccountRepository`, `AuditLogRepository` | `energy_accounts`, `audit_logs` | 需 PIN；保存绑定与脱敏信息 | 无 |
| DELETE | `/api/v1/energy/binding` | `EnergyController` | `EnergyBindingService` | `EnergyAccountRepository`, `AuditLogRepository` | `energy_accounts`, `audit_logs` | 需 PIN；解绑后 `binding_status=UNBOUND` | 无 |
| POST | `/api/v1/energy/refresh` | `EnergyController` | `EnergyRefreshService` | `EnergyAccountRepository`, `EnergySnapshotRepository`, `WsEventOutboxRepository` | `energy_accounts`, `energy_snapshots`, `ws_event_outbox` | 启动刷新任务；返回受理结果 | `energy_refresh_completed` / `energy_refresh_failed` |

## 5.10 默认媒体绑定

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/media/default` | `MediaController` | `DefaultMediaBindingService` | `MediaBindingRepository`, `DeviceRepository`, `DeviceRuntimeStateRepository`, `DeviceControlSchemaRepository` | `media_bindings`, `devices`, `device_runtime_states`, `device_control_schemas` | 注意 `binding_status` 与 `availability_status` 分离；`binding_status` 取自 `media_bindings` 真源，`availability_status` 必须优先由已绑定设备的 `device_runtime_states` 派生，绑定表中的同名字段若存在仅作缓存/降级快照 | 无 |
| PUT | `/api/v1/media/default/binding` | `MediaController` | `DefaultMediaBindingService` | `MediaBindingRepository`, `DeviceRepository`, `AuditLogRepository` | `media_bindings`, `devices`, `audit_logs` | 需 PIN；手动指定唯一默认媒体设备 | 可选 `media_state_changed` |
| DELETE | `/api/v1/media/default/binding` | `MediaController` | `DefaultMediaBindingService` | `MediaBindingRepository`, `AuditLogRepository` | `media_bindings`, `audit_logs` | 需 PIN；解绑后 `binding_status=MEDIA_UNSET` | 可选 `media_state_changed` |

## 5.11 页面资源上传

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/page-assets/floorplan` | `PageAssetsController` | `FloorplanAssetService` | `PageAssetRepository`, `AuditLogRepository` | `page_assets`, `audit_logs` | 需 PIN；只负责资源更新，不直接 Publish | 无 |

## 5.12 备份恢复

| Method | Path | Controller | Service | Repository | Tables | 关键校验/说明 | 成功后事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/system/backups` | `BackupsController` | `BackupService` | `BackupRepository`, `AuditLogRepository` | `system_backups`, `audit_logs` | 需 PIN；创建家庭级备份快照 | 无 |
| GET | `/api/v1/system/backups` | `BackupsController` | `BackupService` | `BackupRepository` | `system_backups` | 列出备份清单 | 无 |
| POST | `/api/v1/system/backups/{backup_id}/restore` | `BackupsController` | `BackupRestoreService` | `BackupRepository`, `SettingsVersionRepository`, `FavoriteDeviceRepository`, `PageSettingRepository`, `FunctionSettingRepository`, `LayoutVersionRepository`, `LayoutHotspotRepository`, `AuditLogRepository`, `WsEventOutboxRepository` | `system_backups`, `settings_versions`, `favorite_devices`, `page_settings`, `function_settings`, `layout_versions`, `layout_hotspots`, `audit_logs`, `ws_event_outbox` | 需 PIN；按冻结闭环恢复正式设置快照与正式布局快照，并重新生成新的 `settings_version` 与 `layout_version`，而不是覆盖旧版本 | `backup_restore_completed` |

## 5.13 WebSocket

| Method | Path | Controller/Gateway | Service | Repository | Tables | 关键校验/说明 | 事件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WS | `/ws` | `RealtimeGateway` | `WsEventDispatchService` | `TerminalRepository`, `WsEventOutboxRepository`, `PinSessionRepository` | `terminals`, `ws_event_outbox`, `pin_sessions` | 处理连接鉴权、`terminal_id`、`sequence`、重连补偿、`snapshot_required`；`ws_event_outbox` 必须以 `(home_id, event_id)` 或等价唯一约束保证事件幂等 | 所有冻结事件 |

---

## 六、每类接口的 service 内部步骤

## 6.1 首页总览读取

`HomeOverviewQueryService` 实施步骤：

1. 读取当前正式 `layout_version`。
2. 读取对应 `layout_hotspots`。
3. 批量读取热点设备及其运行态、告警、入口行为。
4. 读取当前生效 `settings_version`。
5. 通过该 `settings_version` 读取 `page_settings / function_settings / favorite_devices` 快照。
6. 读取 `media_bindings`，并以绑定设备运行态派生 `availability_status`。
7. 通过外部天气源 + 短 TTL 缓存获取 `sidebar.weather`。
8. 读取最新 `energy_snapshots`。
9. 按接口清单拼成 `sidebar` 统一结构。
10. 若进入缓存态，置 `cache_mode=true` 而不是直接失败。

## 6.2 控制受理

`DeviceControlCommandService` 实施步骤：

1. 校验 `request_id` 是否已存在。
2. 若重复且语义一致，返回原结果。
3. 若重复但语义不同，抛 `REQUEST_ID_CONFLICT`。
4. 读取设备能力和 `control_schema`。
5. 校验在线态、只读态、动作、目标和值域。
6. 新建 `device_control_requests`，状态先记受理结果。
7. 记录第一条 transition。
8. 交给 HA 适配层异步执行。
9. 最终状态回写 `device_control_requests` 并记录 transition。
10. 通过 `ws_event_outbox` 发控制相关事件。

## 6.3 Save All

`SettingsSaveService` 实施步骤：

1. 校验 PIN 会话。
2. 校验 `settings_version` 是否与当前生效版本一致。
3. 生成新的 `settings_versions`。
4. 写入新快照：`favorite_devices / page_settings / function_settings`，并统一挂到新建版本记录上。
5. 记录审计日志。
6. 发 `settings_updated`。

`SessionQueryService` 对 `features` 的取值要求：

1. `music_enabled` 读取当前生效 `function_settings.music_enabled`。
2. `energy_enabled` 读取后端 `CapabilityProvider` 的部署级或家庭级能力开关，不从设置快照推导。
3. `editor_enabled` 读取后端 `CapabilityProvider` 的部署级或家庭级能力开关，不从设置快照推导。

## 6.4 Publish

`EditorPublishService` 实施步骤：

1. 校验 PIN 会话。
2. 校验 `lease_id` 是否有效且归当前终端。
3. 校验 `draft_version`。
4. 校验 `base_layout_version` 未变化。
5. 读取当前草稿与热点。
6. 生成新的 `layout_versions + layout_hotspots`。
7. 释放锁。
8. 写审计日志。
9. 发 `publish_succeeded`。

## 6.5 备份恢复

`BackupRestoreService` 实施步骤：

1. 校验 PIN。
2. 校验 `backup_id` 存在。
3. 从备份快照恢复 settings 快照与 layout 快照。
4. 不覆盖旧版本，而是生成新的 `settings_version` 与 `layout_version`。
5. 写审计日志。
6. 发 `backup_restore_completed`。

---

## 七、Repository 分层

为了避免 service 变成巨型上帝对象，Repository 按 3 层用途划分：

## 7.1 基础 CRUD Repository

适合：

- `HomeRepository`
- `RoomRepository`
- `TerminalRepository`
- `PageAssetRepository`
- `BackupRepository`

职责：

- 单表 CRUD
- 基础查询
- 简单唯一键读取

## 7.2 聚合读取 Repository

适合：

- `HomeOverviewReadRepository`
- `DeviceDetailReadRepository`
- `SettingsSnapshotReadRepository`
- `EditorDraftReadRepository`

职责：

- 多表 join / 批量预取
- 为 query service 提供读模型
- 减少 controller/service 里散落 join 逻辑

## 7.3 事务型 Command Repository

适合：

- `SettingsVersionRepository`
- `LayoutVersionRepository`
- `DraftLeaseRepository`
- `DeviceControlRequestRepository`
- `WsEventOutboxRepository`

职责：

- 写请求事务边界
- 版本推进
- 锁状态推进
- 幂等插入
- 事件出站

---

## 八、与 WebSocket 的映射

| 触发场景 | 推荐 service | 事件 | 出站表/机制 |
| --- | --- | --- | --- |
| Save All 成功 | `SettingsSaveService` | `settings_updated` | `ws_event_outbox` |
| Publish 成功 | `EditorPublishService` | `publish_succeeded` | `ws_event_outbox` |
| 备份恢复成功 | `BackupRestoreService` | `backup_restore_completed` | `ws_event_outbox` |
| 全屋摘要变化 | `HomeOverviewQueryService` / HA 回推处理器 | `summary_updated` | `ws_event_outbox` |
| 控制状态变化 | `DeviceControlCommandService` / HA 回推处理器 | `device_state_changed` / `media_state_changed` | `ws_event_outbox` |
| 编辑锁被占用/失效/接管 | `EditorSessionService` | `draft_lock_acquired` / `draft_lock_lost` / `draft_taken_over` | `ws_event_outbox` |
| 电量刷新完成/失败 | `EnergyRefreshService` | `energy_refresh_completed` / `energy_refresh_failed` | `ws_event_outbox` |
| 保存/发布冲突被判定 | `SettingsSaveService` / `EditorDraftService` / `EditorPublishService` | `version_conflict_detected` | `ws_event_outbox` |
| HA 同步受限/恢复 | `HaSyncMonitorService` | `ha_sync_degraded` / `ha_sync_recovered` | `ws_event_outbox` |

实施要求：

- 不要在业务事务提交前直接向 WS 网关“现发”。
- 必须先写 `ws_event_outbox`，再由 dispatcher 异步投递，保证数据库状态和事件至少在一个本地事务里落地。
- `ws_event_outbox` 必须以 `(home_id, event_id)` 或等价唯一约束实现事件幂等；dispatcher 重试不得写入第二条相同事件。

---

## 九、开发落地顺序

## 9.1 第一批：最小首页控制闭环

先实现：

1. `GET /api/v1/auth/session`
2. `GET /api/v1/home/overview`
3. `GET /api/v1/devices/{device_id}`
4. `POST /api/v1/device-controls`
5. `GET /api/v1/device-controls/{request_id}`
6. `/ws` + `device_state_changed`

原因：

- 这是产品最核心的闭环。
- 能最早验证数据库主线是否正确：设备、运行态、控制请求、事件回推。

## 9.2 第二批：Save All 闭环

1. `GET /api/v1/settings`
2. `PUT /api/v1/settings`
3. `GET /api/v1/favorites`
4. `GET /api/v1/page-settings`
5. `GET /api/v1/function-settings`
6. `settings_updated`

## 9.3 第三批：编辑态闭环

1. `POST /api/v1/editor/sessions`
2. `GET /api/v1/editor/draft`
3. `POST /heartbeat`
4. `POST /takeover`
5. `PUT /editor/draft`
6. `POST /editor/publish`
7. `DELETE /editor/draft`
8. `publish_succeeded` / `draft_*` 事件

## 9.4 第四批：外围能力

1. `energy*`
2. `media/default*`
3. `system-connections*`
4. `/devices/reload`
5. `backups*`

---

## 十、最容易做错的接口实施点

### 10.1 把 `GET /settings` 当成多表裸查

问题：

- controller 里直接查多张表，后续逻辑会散。

建议：

- 用 `SettingsQueryService` + `SettingsSnapshotReadRepository` 收口。

### 10.2 把 `POST /device-controls` 做成同步最终结果接口

问题：

- 会违反“受理成功 != 最终成功”的冻结规则。

建议：

- `POST` 只返回受理结果。
- 最终状态走 `GET /device-controls/{request_id}` + WS。

### 10.3 把 `PUT /settings` 和 `POST /editor/publish` 共用同一个配置保存 service

问题：

- 版本语义一定会混乱。

建议：

- `SettingsSaveService` 与 `EditorPublishService` 分开实现。

### 10.4 把编辑锁只做在内存里

问题：

- 无法支撑多实例、重启恢复、强制接管、审计。

建议：

- 锁至少要有数据库真源；Redis 可以是加速层，但不是唯一真源。

### 10.5 WS 事件不落出站表

问题：

- 事务已提交但事件丢了，前端状态不同步。

建议：

- 用 `ws_event_outbox` 或同等可靠事件机制。

---

## 十一、结论

这份映射表的核心作用，是把冻结接口清单真正变成“后端怎么写”的任务拆解表。

后续只要坚持下面 4 条原则，实施基本不会跑偏：

1. **读写分离**：读取聚合用 query service，版本推进/控制执行用 command service。
2. **版本分离**：`settings_version` 与 `layout_version` 永远分开。
3. **状态分离**：控制受理、最终执行、WS 推送、审计记录分别落在对应对象上。
4. **锁与草稿分离**：编辑锁不是草稿内容，Publish 不是 Save All。

按这份映射表推进，你就可以顺利进入下一步：

- PostgreSQL 首版 DDL
- Repository 接口定义
- FastAPI / NestJS / Spring 等具体后端骨架实现
