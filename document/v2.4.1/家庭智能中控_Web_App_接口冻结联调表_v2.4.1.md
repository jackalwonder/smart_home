# 《家庭智能中控 Web App 接口冻结联调表 v2.4.1》

## 一、冲突扫描与推荐修订口径（先行）

### 1.1 已发现冲突

1. `家庭智能中控_Web_App_数据库模型初稿_v2.4.md` 中出现 `GET /api/v1/editor/sessions` 表述，与接口清单冻结口径 `POST /api/v1/editor/sessions` 不一致。
2. WebSocket 连接参数同时出现 `terminal_id/home_id` 与 Bearer token claim，存在双来源歧义。
3. 既有文档强调“重连后主动补拉快照”，但未明确 `last_event_id` 增量补偿的优先级和降级条件。

### 1.2 推荐修订口径

1. 统一以《接口清单 v2.4》为准：编辑会话入口为 `POST /api/v1/editor/sessions`。
2. `home_id/terminal_id` 以 access token claim 为权威来源；连接参数仅作兼容传输或诊断字段，必须与 claim 一致。
3. 重连时优先按 `last_event_id` 尝试增量补偿；若补偿失败或事件窗口缺失，再进入 `snapshot_required=true` 的快照补偿。

---

## 二、文档信息

- 文档名称：家庭智能中控 Web App 接口冻结联调表 v2.4.1
- 文档类型：前后端联调执行文档
- 版本基线：PRD v2.4 + 接口清单 v2.4 + 响应规范 v2.4 + 鉴权方案 v2.4.1
- 后端技术口径：Python 3.12 + FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2

---

## 三、联调总规则

1. 不改变业务范围，不新增接口域。
2. Save All 与 Publish 严格分离。
3. 控制链路严格区分“受理结果”与“最终执行结果”。
4. `request_id` 幂等、`lease + heartbeat` 锁、`ws_event_outbox` 规则必须全链路保持一致。
5. 字段来源必须标注为 `HTTP 初始拉取` 或 `WS 增量更新`。

---

## 四、OpenAPI / Pydantic Schema 对齐规则

1. 每个 HTTP 路由在 FastAPI 必须声明 `response_model`，并与接口清单字段同名（snake_case）。
2. Pydantic v2 模型统一配置 `extra="forbid"`，禁止未冻结字段透出。
3. 枚举值使用 `Literal` 或 `Enum`，来源以接口清单冻结枚举为准。
4. 错误体统一走 `success=false + error + meta` 外壳，不允许返回裸字符串错误。
5. WebSocket 事件 payload 使用独立 Pydantic 模型校验，不与 HTTP DTO 混用。
6. OpenAPI 仅描述 HTTP；WebSocket 事件契约以《WebSocket 事件契约 v2.4.1》作为补充规范。
7. `meta.server_time` 统一由后端同一时钟源注入。
8. 控制结果接口 `GET /device-controls/{request_id}` 中 TIMEOUT 仍为 `success=true` + `data.execution_status=TIMEOUT`。

---

## 五、接口冻结联调映射表

说明：

1. `HTTP 初始字段` 表示页面首屏或进入页面时必须通过 HTTP 获取的字段。
2. `WS 增量字段` 表示运行期通过事件更新的字段。

| 页面 | 组件 | Store | 用户动作 | API | 请求关键字段 | HTTP 初始字段 | WS 增量字段 | 前端状态变化 | 错误码 | 相关 WS 事件 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 全局启动 | AppShell | `authStore` | 应用启动/路由守卫 | `GET /api/v1/auth/session` | Bearer token | `home_id, terminal_id, pin_session_active, features` | 无 | 建立会话态、能力开关 | `UNAUTHORIZED` | 无 |
| 设置/编辑入口 | PinVerifyDialog | `pinStore` | 输入 PIN 验证 | `POST /api/v1/auth/pin/verify` | `pin, target_action, terminal_id` | `verified, pin_session_active, pin_session_expires_at` | 无 | PIN 会话激活、失败计数刷新 | `PIN_REQUIRED, PIN_LOCKED, UNAUTHORIZED` | 无 |
| 设置/编辑入口 | PinSessionBadge | `pinStore` | 查询 PIN 有效期 | `GET /api/v1/auth/pin/session` | token | `pin_session_active, pin_session_expires_at` | 无 | 免验状态刷新 | `UNAUTHORIZED` | 无 |
| 首页 | HomeOverviewPage | `homeOverviewStore` | 进入首页 | `GET /api/v1/home/overview` | `layout_version?, settings_version?` | `stage, sidebar, quick_entries, energy_bar, system_state, layout_version, settings_version, cache_mode` | `summary`、版本号、部分设备运行态 | 首屏渲染主舞台与侧栏 | `UNAUTHORIZED` | `summary_updated, settings_updated, publish_succeeded, backup_restore_completed, device_state_changed, media_state_changed` |
| 首页浮层 | PanelDrawer | `panelStore` | 打开灯光/空调/离线/低电量/常用浮层 | `GET /api/v1/home/panels/{panel_type}` | `panel_type` | `items[]` | `device_state_changed` 影响条目状态 | 浮层列表实时更新 | `UNAUTHORIZED, INVALID_PARAMS` | `device_state_changed, summary_updated` |
| 设备详情 | DeviceDetailDrawer | `deviceDetailStore` | 打开设备详情 | `GET /api/v1/devices/{device_id}` | `device_id` | `device_meta, runtime_state, control_schema` | `runtime_state, error_code` | 控制区可用性变化 | `UNAUTHORIZED, DEVICE_NOT_FOUND` | `device_state_changed, media_state_changed` |
| 设备控制 | DeviceControlBar | `deviceControlStore` | 点击控制按钮 | `POST /api/v1/device-controls` | `request_id, device_id, action_type, payload` | `accepted, acceptance_status, timeout_seconds, result_query_path` | `execution_status, related_request_id, runtime_state` | 命令受理态 -> 最终结果态 | `REQUEST_ID_CONFLICT, DEVICE_OFFLINE, HA_UNAVAILABLE, READONLY_DEVICE, VALUE_OUT_OF_RANGE` | `device_state_changed, media_state_changed` |
| 设备控制补偿 | ControlResultPoller | `deviceControlStore` | WS 异常或超时后补查 | `GET /api/v1/device-controls/{request_id}` | `request_id` | `execution_status, final_runtime_state, error_code, error_message` | 可选与 WS 对账 | 补齐最终状态 | `UNAUTHORIZED` | 与 `related_request_id` 对账 |
| 设置中心 | SettingsPage | `settingsStore` | 打开设置中心 | `GET /api/v1/settings` | token | `favorites, page_settings, function_settings, settings_version` | 版本号变化、配置失效提示 | 表单初始化 | `UNAUTHORIZED` | `settings_updated, backup_restore_completed` |
| Save All | SettingsSaveAction | `settingsStore` | 点击 Save All | `PUT /api/v1/settings` | `settings_version, favorites?, page_settings?, function_settings?` | `saved, settings_version, updated_domains, effective_at` | 同步到其他终端 | 本终端提交成功并刷新版本 | `PIN_REQUIRED, PIN_LOCKED, VERSION_CONFLICT, INVALID_PARAMS` | `settings_updated` |
| 系统连接 | SystemConnectionForm | `systemStore` | 读取连接配置 | `GET /api/v1/system-connections` | token | `home_assistant.*, settings_version` | HA 状态变化提示 | 表单初始值填充 | `UNAUTHORIZED` | `ha_sync_degraded, ha_sync_recovered` |
| 系统连接保存 | SystemConnectionForm | `systemStore` | 保存连接配置 | `PUT /api/v1/system-connections/home-assistant` | `base_url, auth_payload, operator_id, terminal_id` | `saved, connection_status, updated_at` | 可触发后续同步事件 | 提交结果提示 | `PIN_REQUIRED, PIN_LOCKED, INVALID_PARAMS, UNAUTHORIZED` | 可选 `ha_sync_*` |
| 编辑态入口 | EditorEntryGuard | `editorStore` | 获取/创建编辑会话 | `POST /api/v1/editor/sessions` | `terminal_id, takeover_if_locked` | `lease_id, lease_expires_at, lock_status, draft_version` | `lock_status` 变化 | 编辑权限状态建立 | `PIN_REQUIRED, PIN_LOCKED, UNAUTHORIZED` | `draft_lock_acquired, draft_taken_over, draft_lock_lost` |
| 编辑态草稿 | EditorCanvas | `editorStore` | 进入编辑画布 | `GET /api/v1/editor/draft` | `lease_id?` | `draft_exists, draft_version, base_layout_version, layout, readonly` | 锁变化触发只读切换 | 草稿加载 | `UNAUTHORIZED` | `draft_lock_lost, draft_taken_over` |
| 锁续租 | EditorHeartbeat | `editorStore` | 心跳续租（每 20s） | `POST /api/v1/editor/sessions/{lease_id}/heartbeat` | `terminal_id` | `lease_expires_at, lock_status` | 失锁事件 | 保持编辑权限 | `DRAFT_LOCK_LOST, DRAFT_LOCK_TAKEN_OVER, UNAUTHORIZED` | `draft_lock_lost` |
| 编辑发布 | PublishBar | `editorStore` | 点击 Publish | `POST /api/v1/editor/publish` | `lease_id, draft_version, base_layout_version` | `published, layout_version, effective_at` | 广播给全终端 | 发布完成并退出编辑态 | `PIN_REQUIRED, PIN_LOCKED, VERSION_CONFLICT, DRAFT_LOCK_LOST, DRAFT_LOCK_TAKEN_OVER` | `publish_succeeded` |
| 电量 | EnergyCard | `energyStore` | 首页/系统设置读取电量 | `GET /api/v1/energy` | token | `binding_status, refresh_status, usage, cache_mode` | 刷新结果覆盖 | 电量卡状态渲染 | `UNAUTHORIZED` | `energy_refresh_completed, energy_refresh_failed` |
| 电量刷新 | EnergyRefreshButton | `energyStore` | 手动刷新电量 | `POST /api/v1/energy/refresh` | `force_refresh?` | `accepted, refresh_status, started_at` | 刷新完成态 | loading -> success/failed | `ENERGY_SOURCE_ERROR, UNAUTHORIZED` | `energy_refresh_completed, energy_refresh_failed` |
| 媒体卡片 | MediaCard | `mediaStore` | 读取默认媒体 | `GET /api/v1/media/default` | token | `binding_status, availability_status, play_state, track_*` | 播放态/在线态变化 | 卡片信息更新 | `UNAUTHORIZED` | `media_state_changed` |
| 媒体绑定 | MediaBindingForm | `mediaStore` | 绑定/解绑默认媒体 | `PUT/DELETE /api/v1/media/default/binding` | `device_id, operator_id, terminal_id` | `saved, binding_status, availability_status` | 通知其他终端 | 绑定状态更新 | `PIN_REQUIRED, PIN_LOCKED, INVALID_PARAMS, UNAUTHORIZED` | `media_state_changed` |
| 备份列表 | BackupListPage | `backupStore` | 打开备份列表 | `GET /api/v1/system/backups` | token | `items[]` | 恢复后状态刷新 | 列表展示 | `PIN_REQUIRED, PIN_LOCKED, UNAUTHORIZED` | `backup_restore_completed` |
| 备份恢复 | BackupRestoreDialog | `backupStore` | 执行恢复 | `POST /api/v1/system/backups/{backup_id}/restore` | `operator_id, terminal_id` | `restored, settings_version, layout_version, effective_at` | 广播全终端 | 全局配置与布局回到新版本 | `PIN_REQUIRED, PIN_LOCKED, VERSION_CONFLICT, UNAUTHORIZED` | `backup_restore_completed` |

---

## 六、HTTP 与 WS 字段归属总览

1. `layout_version/settings_version` 初值来自 HTTP；变化优先由 `publish_succeeded/settings_updated/backup_restore_completed` 驱动。
2. `summary`、设备运行态、媒体播放态初值来自 HTTP；运行期由 `summary_updated/device_state_changed/media_state_changed` 驱动。
3. 编辑锁状态初值来自 `POST /editor/sessions` 与 `GET /editor/draft`；运行期由 `draft_lock_*` 驱动。
4. 电量状态初值来自 `GET /energy`；运行期由 `energy_refresh_*` 驱动。
5. 若 WS 中断或乱序，按补偿规则回退到 HTTP 快照拉取。

---

## 七、联调验收门槛

1. 每个页面必须完成“HTTP 首次渲染 + WS 增量更新 + 异常补偿”三段验证。
2. 所有冻结错误码必须在前端具备稳定映射，不可用通用 toast 替代全部错误语义。
3. OpenAPI 文档、Pydantic 模型、前端类型定义三方字段必须同名同枚举。
