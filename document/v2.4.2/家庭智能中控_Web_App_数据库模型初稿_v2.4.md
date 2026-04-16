# 《家庭智能中控 Web App 数据库模型实施版 v2.4》

## 一、文档信息

- 文档名称：家庭智能中控 Web App 数据库模型实施版 v2.4
- 文档类型：工程设计文档 / 数据库模型实施版
- 适用对象：后端、前端联调、测试、运维、Codex 任务拆解
- 编制日期：2026-04-14
- 版本状态：已冻结（实施版）
- 基线文档：
  - 《家庭智能中控 Web App PRD v2.4》
  - 《家庭智能中控 Web App 接口清单 v2.4》
  - 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》

---

## 二、目标与范围

本稿目标是把已冻结的产品、接口、统一响应规则翻译为第一版可落地的数据库模型，支撑以下能力：

1. 首页总览、浮层、设备详情、房间/设备列表。
2. 单设备控制请求、幂等、结果查询、状态回推。
3. 设置中心 Save All、版本号管理、多端同步。
4. 编辑态 Draft / Lease / Heartbeat / Publish / Takeover。
5. 默认媒体设备绑定、音乐卡片、电量绑定与快照。
6. 备份恢复、审计日志。
7. 后端统一接入 Home Assistant，并把原始实体映射为业务设备。

本稿不覆盖：

1. 具体 ORM 写法。
2. 具体 SQL DDL 细节。
3. 第三方服务 SDK 集成细节。
4. 文件存储、对象存储、CDN 的实现细节。
5. WebSocket 服务器部署拓扑。

---

## 三、建模原则

### 3.1 真源原则

1. 后端数据库是配置、映射、版本、草稿、控制记录的唯一业务真源。
2. 前端本地缓存不是业务真源，只用于受限态展示。
3. Home Assistant 原始实体不直接暴露给前端，前端只消费业务设备模型。

### 3.2 版本分离原则

1. 表单型配置走 `settings_version`。
2. 主舞台结构型配置走 `layout_version`。
3. Save All 与 Publish 必须分离，不得共用一套写入口或版本号。

### 3.3 控制建模原则

1. 所有控制统一走 `action_type + payload`。
2. 所有控制请求必须落库，支撑 `request_id` 幂等、结果查询、审计追踪。
3. 受理结果与最终执行结果必须分离存储。

### 3.4 编辑态原则

1. 草稿与正式布局分离。
2. 锁租约与草稿内容分离。
3. 失锁、被接管、发布成功都要可追踪。

### 3.5 命名与字段原则

1. 数据库统一使用 snake_case。
2. 所有内部主键统一使用 UUID；对外业务 ID 按接口契约输出。
3. 所有时间字段统一使用 UTC ISO 8601 对应的时间戳存储能力。
4. 高频变化的运行态与低频变化的静态配置尽量拆表，降低写冲突。
5. 对外返回为数组的复杂字段，在数据库层可使用子表或 JSON；本稿优先给出“可查询 + 可演进”的建模。

### 3.6 目标数据库

v2.4 实施版统一使用 PostgreSQL。原因：

1. 适合版本化配置、事务、唯一约束、乐观冲突控制。
2. 适合 JSON/JSONB 承载 `capabilities`、`runtime_state`、`payload` 等半结构化字段。
3. 适合做审计日志、控制记录、快照恢复。

---

## 四、核心枚举域

以下枚举作为实施级枚举统一管理：

1. `terminal_mode`：`KIOSK` / `DESKTOP`
2. `device_type`：至少覆盖灯光、空调、窗帘、音乐及后续复杂设备类型
3. `confirmation_type`：`ACK_DRIVEN` / `TARGET_STATE_DRIVEN` / `PLAYBACK_STATE_DRIVEN`
4. `entry_behavior`：`QUICK_ACTION` / `OPEN_CONTROL_CARD` / `OPEN_MEDIA_POPUP` / `OPEN_COMPLEX_CARD` / `OPEN_READONLY_CARD` / `DISABLED_OFFLINE`
5. `execution_status`：`PENDING` / `ACK_SUCCESS` / `SUCCESS` / `RECONCILING` / `FAILED` / `TIMEOUT` / `STATE_MISMATCH`
6. `acceptance_status`：`ACCEPTED` / `REJECTED`
7. `entity_role`：`PRIMARY_CONTROL` / `SECONDARY_CONTROL` / `TELEMETRY` / `STATUS` / `ALERT` / `DERIVED`
8. `connection_status`：`CONNECTED` / `DISCONNECTED` / `DEGRADED`
9. `binding_status`（电量）：`UNBOUND` / `BOUND` / `BINDING_INVALID`
10. `refresh_status`（电量）：`IDLE` / `LOADING` / `SUCCESS` / `FAILED` / `CACHE_STALE`
11. `media_binding_status`（对应接口字段 `binding_status`）：`MEDIA_UNSET` / `MEDIA_SET`
12. `availability_status`：`ONLINE` / `OFFLINE`
13. `editor_lock_query_status`（接口查询态，不直接落库）：`GRANTED` / `LOCKED_BY_OTHER` / `READ_ONLY`
14. `lease_status`（租约持久化状态）：`ACTIVE` / `RELEASED` / `LOST` / `TAKEN_OVER`
15. `lost_reason`：`LEASE_EXPIRED` / `TAKEN_OVER`
16. `change_domain`：`DEVICE_STATE` / `SUMMARY` / `SETTINGS` / `LAYOUT` / `EDITOR_LOCK` / `ENERGY` / `MEDIA` / `BACKUP`
17. 最小错误码全集：按冻结文档统一维护，不在数据库层自创第二套错误码

---

## 五、表总览

### 5.1 基础身份与终端域

1. `homes`
2. `members`
3. `terminals`
4. `home_auth_configs`
5. `pin_sessions`
6. `pin_lock_records`

### 5.2 HA 接入与设备域

7. `rooms`
8. `ha_entities`
9. `devices`
10. `device_entity_links`
11. `device_runtime_states`
12. `device_alert_badges`
13. `device_control_schemas`

### 5.3 首页正式布局域

14. `page_assets`
15. `layout_versions`
16. `layout_hotspots`

### 5.4 设置中心域

17. `settings_versions`
18. `favorite_devices`
19. `page_settings`
20. `function_settings`

### 5.5 系统连接 / 电量 / 媒体域

21. `system_connections`
22. `energy_accounts`
23. `energy_snapshots`
24. `media_bindings`

### 5.6 编辑态域

25. `draft_layouts`
26. `draft_hotspots`
27. `draft_leases`

### 5.7 控制 / 推送 / 备份 / 审计域

28. `device_control_requests`
29. `device_control_request_transitions`
30. `system_backups`
31. `audit_logs`

### 5.8 实施增强表（本稿默认纳入首版）

32. `ws_event_outbox`
33. `ha_sync_status`

---

## 六、详细表设计

## 6.1 基础身份与终端域

### 6.1.1 `homes`

用途：家庭主实体。

核心字段：

- `id` PK
- `home_code` UK，可选的人类可读编码
- `display_name`
- `timezone`
- `status`
- `capability_flags_json` 可选，用于家庭级能力开关覆盖；本期如未启用家庭级覆盖，可留空
- `created_at`
- `updated_at`

约束与索引：

- `home_code` 唯一索引
- `updated_at` 普通索引（可选）

说明：

- 当前版本虽是单家庭固定账号，但数据库层仍保留多家庭能力，避免后期重构。
- `GET /api/v1/auth/session` 中 `features.energy_enabled`、`features.editor_enabled` 默认由后端 `CapabilityProvider` / 部署级 feature flag 提供，不强制以关系库为真源；若后续需要家庭级覆盖，可落在 `capability_flags_json`，但本期不单独扩展新表。

### 6.1.2 `members`

用途：家庭成员/操作人，支撑审计、备份恢复、发布操作记录。

核心字段：

- `id` PK
- `home_id` FK -> `homes.id`
- `display_name`
- `role`
- `is_active`
- `created_at`
- `updated_at`

约束与索引：

- `(home_id, display_name)` 普通索引
- `home_id` 索引

### 6.1.3 `terminals`

用途：墙板、桌面等终端记录，支撑 PIN 会话、编辑锁、事件追踪。

核心字段：

- `id` PK
- `home_id` FK
- `terminal_code` UK
- `terminal_name`
- `terminal_mode`
- `last_seen_at`
- `last_ip` 可选
- `created_at`
- `updated_at`

约束与索引：

- `terminal_code` 唯一索引
- `(home_id, terminal_mode)` 索引

### 6.1.4 `home_auth_configs`

用途：家庭级固定账号与 PIN 配置。

核心字段：

- `id` PK
- `home_id` FK unique
- `login_mode`，当前固定 `FIXED_HOME_ACCOUNT`
- `pin_hash`
- `pin_salt` 或由密码库内部管理
- `pin_retry_limit`，默认 5
- `pin_lock_minutes`，默认 5
- `pin_session_ttl_seconds`，默认 600
- `created_at`
- `updated_at`

约束与索引：

- `home_id` 唯一索引

### 6.1.5 `pin_sessions`

用途：终端级管理会话。

核心字段：

- `id` PK
- `home_id` FK
- `terminal_id` FK
- `member_id` FK 可空
- `verified_for_action` 可空，对应最近一次 `POST /api/v1/auth/pin/verify` 的 `target_action`
- `session_token_hash`
- `is_active`
- `verified_at`
- `expires_at`
- `created_at`
- `updated_at`

约束与索引：

- `(home_id, terminal_id, is_active)` 组合索引
- partial unique index on `(home_id, terminal_id)` where `is_active = true`
- `expires_at` 索引

说明：

- 冻结规则是“同一终端验证成功后，管理会话有效期 10 分钟”，因此应建模为终端级活跃会话，而不是按动作范围拆多份活跃会话。
- `verified_for_action` 仅用于审计或风控，不应作为会话唯一键的一部分。

### 6.1.6 `pin_lock_records`

用途：PIN 输错锁定记录。

核心字段：

- `id` PK
- `home_id` FK
- `terminal_id` FK
- `failed_attempts`
- `locked_until`
- `last_failed_at`
- `created_at`
- `updated_at`

约束与索引：

- `(home_id, terminal_id)` 唯一索引
- `locked_until` 索引

---

## 6.2 HA 接入与设备域

### 6.2.1 `rooms`

用途：房间主表。

核心字段：

- `id` PK
- `home_id` FK
- `room_name`
- `priority`
- `visible_in_editor`
- `sort_order`
- `created_at`
- `updated_at`

约束与索引：

- `(home_id, room_name)` 唯一索引
- `(home_id, sort_order)` 索引

### 6.2.2 `ha_entities`

用途：缓存和管理 Home Assistant 原始实体。

核心字段：

- `id` PK
- `home_id` FK
- `entity_id` UK within home
- `platform`
- `domain`
- `raw_name`
- `state`
- `attributes_json`
- `last_synced_at`
- `last_state_changed_at`
- `room_hint`
- `is_available`
- `created_at`
- `updated_at`

约束与索引：

- `(home_id, entity_id)` 唯一索引
- `(home_id, domain)` 索引
- `last_synced_at` 索引

说明：

- 这是平台级对象，不直接对前端暴露。

### 6.2.3 `devices`

用途：业务设备主表，是前端消费和统计的最小单位。

核心字段：

- `id` PK
- `home_id` FK
- `room_id` FK -> `rooms.id`
- `display_name`
- `raw_name`
- `device_type`
- `is_complex_device`
- `is_readonly_device`
- `confirmation_type`
- `entry_behavior`
- `default_control_target`
- `is_primary_device`
- `is_homepage_visible`
- `capabilities_json`
- `source_meta_json`，可选
- `created_at`
- `updated_at`

约束与索引：

- `home_id` 索引
- `(home_id, room_id)` 索引
- `(home_id, device_type)` 索引
- `(home_id, is_homepage_visible)` 索引

说明：

- 低频静态配置与映射信息放在本表。
- 高频运行态不建议直接写本表，避免写放大与行锁冲突。

### 6.2.4 `device_entity_links`

用途：业务设备与原始实体的聚合映射。

核心字段：

- `id` PK
- `home_id` FK
- `device_id` FK -> `devices.id`
- `ha_entity_id` FK -> `ha_entities.id`
- `entity_role`
- `is_primary`
- `sort_order`
- `created_at`
- `updated_at`

约束与索引：

- `(device_id, ha_entity_id)` 唯一索引
- `ha_entity_id` 唯一索引
- `(device_id, entity_role)` 索引
- `(home_id, device_id)` 索引

说明：

- 满足多实体聚合与实体角色冻结规则。

### 6.2.5 `device_runtime_states`

用途：业务设备最新运行态快照。

核心字段：

- `device_id` PK / FK -> `devices.id`
- `home_id` FK
- `status`
- `is_offline`
- `status_summary_json`
- `runtime_state_json`
- `aggregated_state`
- `aggregated_mode`
- `aggregated_position`
- `last_state_update_at`
- `updated_at`

约束与索引：

- `device_id` 主键
- `(home_id, status)` 索引
- `(home_id, is_offline)` 索引
- `last_state_update_at` 索引

说明：

- 首页总览、浮层、设备详情都可以优先读这张表。
- `status_summary_json` 对应接口中的 `status_summary`。
- `runtime_state_json` 对应设备详情与控制结果中的 `runtime_state` / `final_runtime_state` 结构。

### 6.2.6 `device_alert_badges`

用途：设备告警角标表。

核心字段：

- `id` PK
- `device_id` FK
- `code`
- `level`
- `text`
- `is_active`
- `created_at`
- `updated_at`

约束与索引：

- `(device_id, is_active)` 索引
- `(device_id, level)` 索引

说明：

- 对应接口冻结字段 `alert_badges[]`。

### 6.2.7 `device_control_schemas`

用途：设备控制 schema 冻结表。

核心字段：

- `id` PK
- `device_id` FK
- `action_type`
- `target_scope`
- `target_key`
- `value_type`
- `value_range_json`
- `allowed_values_json`
- `unit`
- `is_quick_action`
- `requires_detail_entry`
- `sort_order`
- `created_at`
- `updated_at`

约束与索引：

- `(device_id, action_type, target_scope, target_key)` 唯一索引
- `device_id` 索引

说明：

- 只读设备在读取时应返回空数组；数据库层可不创建记录，也可保留历史配置但在应用层屏蔽。

---

## 6.3 首页正式布局域

### 6.3.1 `page_assets`

用途：页面资源，如户型底图。

核心字段：

- `id` PK
- `home_id` FK
- `asset_type`，当前至少支持 `FLOORPLAN`
- `file_url`
- `file_hash`
- `width`
- `height`
- `mime_type`
- `uploaded_by_member_id`
- `uploaded_by_terminal_id`
- `created_at`

约束与索引：

- `(home_id, asset_type, created_at)` 索引

### 6.3.2 `layout_versions`

用途：正式布局版本表。

核心字段：

- `id` PK
- `home_id` FK
- `layout_version` UK within home
- `background_asset_id` FK -> `page_assets.id`
- `layout_meta_json`
- `effective_at`
- `published_by_member_id`
- `published_by_terminal_id`
- `created_at`

约束与索引：

- `(home_id, layout_version)` 唯一索引
- `(home_id, effective_at desc)` 索引

说明：

- 正式版本采用不可变版本记录。
- 当前生效版本的唯一判定口径冻结为：按 `(effective_at desc, created_at desc)` 取最新正式版本；本稿不再引入额外 `current_layout_version` 指针表或 `homes` 冗余列作为第二真源。

### 6.3.3 `layout_hotspots`

用途：正式布局下的热点明细。

核心字段：

- `id` PK
- `layout_version_id` FK -> `layout_versions.id`
- `hotspot_id` 业务热点 ID
- `device_id` FK
- `x`
- `y`
- `icon_type`
- `label_mode`
- `is_visible`
- `structure_order`
- `display_policy`
- `created_at`
- `updated_at`

约束与索引：

- `(layout_version_id, hotspot_id)` 唯一索引
- `(layout_version_id, structure_order)` 索引
- `device_id` 索引

说明：

- `x`、`y` 必须存 0~1 归一化相对坐标。
- 正式态不得以像素坐标持久化。

---

## 6.4 设置中心域

### 6.4.1 `settings_versions`

用途：Save All 的版本记录表。

核心字段：

- `id` PK
- `home_id` FK
- `settings_version` UK within home
- `updated_domains_json`
- `effective_at`
- `saved_by_member_id`
- `saved_by_terminal_id`
- `created_at`

约束与索引：

- `(home_id, settings_version)` 唯一索引
- `(home_id, effective_at desc)` 索引

说明：

- 仅记录表单型配置版本，不覆盖系统连接、电量绑定、媒体绑定等即时动作。

### 6.4.2 `favorite_devices`

用途：常用设备配置快照；每次 Save All 成功后，写入新 `settings_version` 对应的一组快照记录。

核心字段：

- `id` PK
- `home_id` FK
- `settings_version_id` FK -> `settings_versions.id`
- `device_id` FK
- `selected`
- `favorite_order`
- `created_at`

约束与索引：

- `(settings_version_id, device_id)` 唯一索引
- partial unique index on `(settings_version_id, favorite_order)` where `selected = true`
- `(home_id, settings_version_id)` 索引

说明：

- 本表只保存“某个设置版本下最终选中的收藏快照”；`GET /api/v1/favorites` 中的 `selected / is_selectable / exclude_reason` 由 `devices` 与当前生效快照聚合得出，不把所有候选设备逐行固化进本表。

### 6.4.3 `page_settings`

用途：页面设置快照；与某个 `settings_version` 一一对应。

核心字段：

- `id` PK
- `home_id` FK
- `settings_version_id` FK -> `settings_versions.id` unique
- `room_label_mode`
- `homepage_display_policy_json`
- `icon_policy_json`
- `layout_preference_json`
- `created_at`
- `updated_at`

约束与索引：

- `settings_version_id` 唯一索引
- `(home_id, settings_version_id)` 索引

### 6.4.4 `function_settings`

用途：功能设置快照；与某个 `settings_version` 一一对应。

核心字段：

- `id` PK
- `home_id` FK
- `settings_version_id` FK -> `settings_versions.id` unique
- `low_battery_threshold`
- `offline_threshold_seconds`
- `quick_entry_policy_json`
- `music_enabled`
- `favorite_limit`
- `auto_home_timeout_seconds`
- `position_device_thresholds_json`
- `created_at`
- `updated_at`

约束与索引：

- `settings_version_id` 唯一索引
- `(home_id, settings_version_id)` 索引

说明：

- `position_device_thresholds_json` 至少承载 `closed_max` 与 `opened_min`。

---

## 6.5 系统连接 / 电量 / 媒体域

### 6.5.1 `system_connections`

用途：系统连接配置，目前至少包含 Home Assistant。

核心字段：

- `id` PK
- `home_id` FK
- `system_type`，当前至少 `HOME_ASSISTANT`
- `connection_mode`
- `base_url_encrypted`
- `auth_payload_encrypted`
- `auth_configured`
- `connection_status`
- `last_test_at`
- `last_test_result`
- `last_sync_at`
- `last_sync_result`
- `updated_at`

约束与索引：

- `(home_id, system_type)` 唯一索引
- `(home_id, connection_status)` 索引

说明：

- 系统连接不是 Save All 的一部分。

### 6.5.2 `energy_accounts`

用途：电量账户绑定配置。

核心字段：

- `id` PK
- `home_id` FK unique
- `binding_status`
- `account_payload_encrypted`
- `updated_by_member_id`
- `updated_by_terminal_id`
- `updated_at`

约束与索引：

- `home_id` 唯一索引

### 6.5.3 `energy_snapshots`

用途：电量数据快照与刷新结果记录。

核心字段：

- `id` PK
- `home_id` FK
- `binding_status`
- `refresh_status`
- `yesterday_usage`
- `monthly_usage`
- `yearly_usage`
- `balance`
- `cache_mode`
- `last_error_code`
- `source_updated_at`
- `created_at`

约束与索引：

- `(home_id, created_at desc)` 索引
- `(home_id, refresh_status)` 索引

说明：

- 当前最新一条快照可作为 `GET /api/v1/energy` 的读取源。

### 6.5.4 `media_bindings`

用途：默认媒体设备绑定。

核心字段：

- `id` PK
- `home_id` FK unique
- `device_id` FK -> `devices.id` 可空
- `binding_status`
- `availability_status` 可空，仅作为聚合层缓存/快照字段
- `updated_by_member_id`
- `updated_by_terminal_id`
- `updated_at`

约束与索引：

- `home_id` 唯一索引
- `device_id` 索引

说明：

- 必须显式区分 `binding_status` 与 `availability_status`。
- `MEDIA_UNSET` 时允许 `device_id`、`availability_status` 为空。
- `binding_status` 由绑定域真源决定，即以 `media_bindings` 当前记录为准。
- `availability_status` 的正式对外口径必须优先由已绑定设备的 `device_runtime_states` 派生；若本表保留该字段，仅可作为聚合缓存或降级快照，不得与运行态形成双真源。

### 6.5.5 天气聚合链路（本期不强制建表）

用途：支撑 `GET /api/v1/home/overview` 中 `sidebar.weather` 的实现来源说明。

实施要求：

- 本期关系库 DDL 不强制建设专用天气表。
- `sidebar.weather` 由后端聚合层通过外部天气数据源获取，并使用短 TTL 缓存（如内存缓存、Redis 或等价缓存层）提供读取。
- 若天气源不可用，聚合层应按接口契约返回业务可接受的降级结果；不得因为缺少数据库表而让冻结字段失去实现来源说明。

---

## 6.6 编辑态域

### 6.6.1 `draft_layouts`

用途：当前家庭草稿主表。

核心字段：

- `id` PK
- `home_id` FK unique
- `draft_version`
- `base_layout_version`
- `background_asset_id` FK -> `page_assets.id`
- `layout_meta_json`
- `readonly_snapshot_json` 可选
- `updated_by_member_id`
- `updated_by_terminal_id`
- `updated_at`

约束与索引：

- `home_id` 唯一索引
- `draft_version` 索引
- `base_layout_version` 索引

说明：

- 当前冻结契约更偏向“每个家庭同一时刻只有一份活跃草稿”。
- `draft_version` 是“当前活跃草稿”的乐观并发版本令牌，不是历史草稿主键。
- 每次 `PUT /api/v1/editor/draft` 成功后必须推进到新的 `draft_version`；`takeover` 不新建第二份草稿，只沿用同一家庭当前草稿并在后续成功写入时继续推进版本。
- 如未来要支持历史草稿，可再拆为草稿版本表；但 v2.4 实施版不采用多活跃草稿模型。

### 6.6.2 `draft_hotspots`

用途：草稿热点明细。

核心字段：

- `id` PK
- `draft_layout_id` FK
- `hotspot_id`
- `device_id` FK
- `x`
- `y`
- `icon_type`
- `label_mode`
- `is_visible`
- `structure_order`
- `updated_at`

约束与索引：

- `(draft_layout_id, hotspot_id)` 唯一索引
- `(draft_layout_id, structure_order)` 索引

说明：

- 同样必须使用 0~1 相对坐标。

### 6.6.3 `draft_leases`

用途：编辑锁租约表。

核心字段：

- `id` PK
- `home_id` FK
- `lease_id` UK
- `terminal_id` FK
- `member_id` FK
- `lease_status`
- `is_active`
- `lease_expires_at`
- `heartbeat_interval_seconds`
- `last_heartbeat_at`
- `taken_over_from_lease_id` 可空
- `lost_reason` 可空
- `created_at`
- `updated_at`

约束与索引：

- `lease_id` 唯一索引
- partial unique index on `(home_id)` where `is_active = true`
- `(home_id, lease_status)` 索引
- `(home_id, lease_expires_at)` 索引
- `(home_id, terminal_id, lease_status)` 索引

说明：

- 必须在数据库/DDL 层保证“同一家庭同一时刻只有一个活跃 lease”；应用层不得只依赖内存锁或单纯业务判断。
- 实施语义为：当前持锁记录 `is_active = true`，被接管、超时失效、主动退出或发布完成后必须在同一事务内改为 `is_active = false`。
- `lease_status` 只表达租约记录自身生命周期，如 `ACTIVE / RELEASED / LOST / TAKEN_OVER`。
- 接口 `POST /api/v1/editor/sessions` 返回的 `lock_status` 不直接落库，而应由查询层基于 `draft_leases.lease_status + is_active + 当前请求终端` 推导出 `GRANTED / LOCKED_BY_OTHER / READ_ONLY`。
- `lease_expires_at` 与 `last_heartbeat_at` 共同支撑失锁判断。

---

## 6.7 控制 / 推送 / 备份 / 审计域

### 6.7.1 `device_control_requests`

用途：控制请求主表，支撑统一控制入口、幂等、结果查询。

核心字段：

- `id` PK
- `home_id` FK
- `request_id` UK within home
- `device_id` FK
- `action_type`
- `payload_json`
- `client_ts`
- `acceptance_status`
- `confirmation_type`
- `execution_status`
- `retry_count`
- `retry_scheduled`
- `accepted_at`
- `completed_at`
- `timeout_seconds`
- `final_runtime_state_json`
- `error_code`
- `error_message`
- `created_at`
- `updated_at`

约束与索引：

- `(home_id, request_id)` 唯一索引
- `(home_id, device_id, created_at desc)` 索引
- `(home_id, execution_status)` 索引
- `accepted_at` 索引
- `completed_at` 索引

说明：

- `request_id` 必须家庭级全局唯一。
- 同一 `request_id` 重放时，需要返回原结果，而不是重复下发控制。

### 6.7.2 `device_control_request_transitions`

用途：控制状态流转历史表。

核心字段：

- `id` PK
- `control_request_id` FK -> `device_control_requests.id`
- `from_status`
- `to_status`
- `reason`
- `error_code`
- `payload_json`
- `created_at`

约束与索引：

- `control_request_id` 索引
- `(control_request_id, created_at)` 索引

说明：

- 必须记录每次受理、ACK_SUCCESS、RECONCILING、SUCCESS、FAILED、TIMEOUT 变更。

### 6.7.3 `system_backups`

用途：备份与恢复记录。

核心字段：

- `id` PK
- `home_id` FK
- `backup_id` UK within home
- `status`
- `note`
- `snapshot_path` 或 `snapshot_blob`
- `created_by_member_id`
- `created_by_terminal_id`
- `created_at`
- `restored_at` 可空

约束与索引：

- `(home_id, backup_id)` 唯一索引
- `(home_id, created_at desc)` 索引

说明：

- v2.4 冻结恢复闭环的最小必备范围应覆盖：正式布局快照、设置中心快照，以及重新生成 `settings_version` / `layout_version` 所需的版本元数据。
- 首版备份恢复范围不包含 `media_bindings`、`energy_accounts` 与设备映射修正；若后续扩展，必须以新版本文档单独声明，不能反向改变 v2.4 已冻结的恢复返回体与同步语义。

### 6.7.4 `audit_logs`

用途：最小审计日志。

核心字段：

- `id` PK
- `home_id` FK
- `operator_id` FK -> `members.id`
- `terminal_id` FK -> `terminals.id`
- `action_type`
- `target_type`
- `target_id`
- `request_id` 可空
- `before_version`
- `after_version`
- `result_status`
- `error_code`
- `payload_json`
- `created_at`

约束与索引：

- `(home_id, created_at desc)` 索引
- `(home_id, action_type, created_at desc)` 索引
- `request_id` 索引

说明：

- 配置发布、强制接管、电量账户绑定/更换/解绑、重新拉取设备列表、PIN 重置、控制请求摘要应落库。

---

## 七、首版正式表

## 7.1 `ws_event_outbox`

用途：可靠推送事件的 outbox 表，本稿实施版用于：

- `device_state_changed`
- `summary_updated`
- `settings_updated`
- `publish_succeeded`
- `draft_lock_acquired`
- `backup_restore_completed`
- `version_conflict_detected`
- `draft_lock_lost`
- `draft_taken_over`
- `energy_refresh_completed`
- `energy_refresh_failed`
- `media_state_changed`
- `ha_sync_degraded`
- `ha_sync_recovered`

核心字段：

- `id` PK
- `home_id` FK
- `event_id`
- `event_type`
- `change_domain`
- `snapshot_required`
- `payload_json`
- `occurred_at`
- `delivery_status`
- `created_at`

约束与索引：

- `(home_id, event_id)` 唯一索引
- `(home_id, created_at)` 索引
- `(home_id, event_type, occurred_at)` 索引

说明：

- 本稿实施版默认采用 outbox 作为正式出站机制。
- `event_id` 必须在家庭级范围内唯一，重复投递或重试不得生成第二条同一业务事件记录。

## 7.2 `ha_sync_status`

用途：记录 HA 事件流状态、补偿同步状态、降级轮询状态。

核心字段：

- `id` PK
- `home_id` FK unique
- `sync_mode`，如 `EVENT_STREAM` / `POLLING`
- `status`，如 `CONNECTED` / `DEGRADED` / `RECOVERING`
- `last_event_at`
- `last_full_resync_at`
- `last_error_code`
- `updated_at`

说明：

- 便于触发 `ha_sync_degraded` / `ha_sync_recovered` 事件。

---

## 八、版本与快照策略

### 8.1 `settings_version` 策略

实施要求：

1. `settings_versions` 记录每次 Save All 成功后的新版本。
2. `favorite_devices`、`page_settings`、`function_settings` 必须通过 `settings_version_id` 归属于某个版本快照，而不是做“单家庭当前态覆盖表”。
3. 恢复备份时生成新的 `settings_version`，而不是回滚覆盖原版本号。

### 8.2 `layout_version` 策略

实施要求：

1. `layout_versions` 做不可变版本记录。
2. `layout_hotspots` 绑定对应正式布局版本。
3. Publish 成功时生成新的 `layout_version`。
4. 恢复备份时同样生成新的 `layout_version`。

### 8.3 `draft_version` 策略

实施要求：

1. `draft_layouts` 在 `home_id` 维度只保留一份当前活跃草稿，因此 `draft_version` 的语义是该活跃草稿的版本令牌。
2. 每次草稿保存成功必须生成新的 `draft_version`，用于后续 `PUT /api/v1/editor/draft` 与 `POST /api/v1/editor/publish` 的乐观并发校验。
3. Publish 时必须同时校验 `lease_id + draft_version + base_layout_version`。
4. Takeover 不生成第二份草稿，也不引入另一套 `draft_version` 口径；新的持锁终端继续操作同一份草稿。

---

## 九、索引与约束冻结清单

以下约束为首版 DDL 必须落实的冻结约束：

1. `(home_id, request_id)` on `device_control_requests` 唯一。
2. `(home_id, layout_version)` on `layout_versions` 唯一。
3. `(home_id, settings_version)` on `settings_versions` 唯一。
4. `(settings_version_id, device_id)` on `favorite_devices` 唯一。
5. `(home_id, entity_id)` on `ha_entities` 唯一。
6. `(device_id, ha_entity_id)` on `device_entity_links` 唯一。
7. `ha_entity_id` on `device_entity_links` 唯一。
8. `(layout_version_id, hotspot_id)` on `layout_hotspots` 唯一。
9. `(draft_layout_id, hotspot_id)` on `draft_hotspots` 唯一。
10. `settings_version_id` unique on `page_settings` / `function_settings`；`home_id` unique on `energy_accounts` / `media_bindings`。
11. `lease_id` unique on `draft_leases`，且 partial unique on `draft_leases(home_id)` where `is_active = true`。
12. `(home_id, event_id)` on `ws_event_outbox` 唯一。

---

## 十、接口到表的映射

### 10.1 首页总览

`GET /api/v1/home/overview`

主要读取：

- `layout_versions`（当前正式版本）
- `layout_hotspots`
- `devices`
- `device_runtime_states`
- `device_alert_badges`
- `settings_versions`（当前生效设置版本）
- `favorite_devices`
- `media_bindings`
- `energy_snapshots`
- `page_settings`
- `function_settings`

### 10.2 设备详情

`GET /api/v1/devices/{device_id}`

主要读取：

- `devices`
- `device_runtime_states`
- `device_alert_badges`
- `device_control_schemas`
- `device_entity_links`
- `ha_entities`

### 10.3 单设备控制

`POST /api/v1/device-controls`

主要写入：

- `device_control_requests`
- `device_control_request_transitions`
- `audit_logs`

主要读取：

- `devices`
- `device_runtime_states`
- `device_control_schemas`

### 10.4 设置中心

`GET /api/v1/settings` / `PUT /api/v1/settings`

主要读写：

- `settings_versions`
- `favorite_devices`
- `page_settings`
- `function_settings`
- `audit_logs`
- `ws_event_outbox`

### 10.5 编辑态

`POST /api/v1/editor/sessions`
`GET /api/v1/editor/draft`
`PUT /api/v1/editor/draft`
`POST /api/v1/editor/publish`

主要读写：

- `draft_leases`
- `draft_layouts`
- `draft_hotspots`
- `layout_versions`
- `layout_hotspots`
- `audit_logs`
- `ws_event_outbox`

### 10.6 电量

`GET /api/v1/energy`
`PUT /api/v1/energy/binding`
`POST /api/v1/energy/refresh`

主要读写：

- `energy_accounts`
- `energy_snapshots`
- `audit_logs`

### 10.7 媒体绑定

`GET /api/v1/media/default`
`PUT /api/v1/media/default/binding`
`DELETE /api/v1/media/default/binding`

主要读写：

- `media_bindings`
- `devices`
- `device_runtime_states`
- `device_control_schemas`
- `audit_logs`

### 10.8 备份恢复

`POST /api/v1/system/backups`
`GET /api/v1/system/backups`
`POST /api/v1/system/backups/{backup_id}/restore`

主要读写：

- `system_backups`
- `settings_versions`
- `layout_versions`
- `favorite_devices`
- `page_settings`
- `function_settings`
- `audit_logs`
- `ws_event_outbox`

---

## 十一、实施顺序

### 11.1 第一批必须先建的表

1. `homes`
2. `members`
3. `terminals`
4. `rooms`
5. `ha_entities`
6. `devices`
7. `device_entity_links`
8. `device_runtime_states`
9. `device_control_schemas`
10. `page_assets`
11. `layout_versions`
12. `layout_hotspots`
13. `device_control_requests`
14. `device_control_request_transitions`

这批表能先支撑：首页总览、设备详情、控制主链路。

### 11.2 第二批表

1. `settings_versions`
2. `favorite_devices`
3. `page_settings`
4. `function_settings`
5. `system_connections`
6. `home_auth_configs`
7. `pin_sessions`
8. `pin_lock_records`

这批表能支撑：设置中心、PIN、系统连接。

### 11.3 第三批表

1. `draft_layouts`
2. `draft_hotspots`
3. `draft_leases`

这批表能支撑：编辑态、发布、接管、失锁。

### 11.4 第四批表

1. `energy_accounts`
2. `energy_snapshots`
3. `media_bindings`
4. `system_backups`
5. `audit_logs`
6. `ws_event_outbox`
7. `ha_sync_status`

这批表能支撑：外围能力、可靠广播、恢复链路、审计与运维排查。

---

## 十二、实施约定

1. 内部主键统一使用 UUID。
2. 首版不引入通用逻辑删除字段；删除语义由状态字段、解绑语义或物理删除分别承担。
3. `layout_version`、`settings_version`、`draft_version` 统一由应用层版本号生成器生成，并由对应 service 在事务内推进。
4. Redis 如需引入，只能作为编辑锁心跳、天气缓存或 WS 会话层辅助缓存，不能替代数据库真源。
5. `system_backups.snapshot_path` 统一保存文件存储或对象存储定位信息；首版不使用数据库大对象。
6. `audit_logs.payload_json` 统一由应用层完成脱敏后再入库。
7. `system_connections`、`energy_accounts` 等敏感字段统一采用应用层加密后入库，必要时接入 KMS 管理密钥。
8. `ws_event_outbox` 首版由本地 dispatcher 轮询分发，不强依赖外部消息队列。

---

## 十三、结论

这版数据库模型已经覆盖了冻结文档要求的核心工程能力：

1. 业务设备作为最小统计与展示单位。
2. Save All 与 Publish 的版本分离。
3. 统一动作模型与控制请求幂等。
4. 编辑锁、心跳、接管、发布链路。
5. 默认媒体设备绑定状态与可用状态分离。
6. 电量、备份恢复、审计日志、多端同步等正式产品能力。

这份文档可直接作为 PostgreSQL migration、Repository 实现与后端骨架编码输入。
