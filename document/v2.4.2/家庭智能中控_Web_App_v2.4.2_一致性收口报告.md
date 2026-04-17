# 《家庭智能中控 Web App v2.4.2 一致性收口报告》

## 一、审查范围

本轮收口基于以下冻结文档与当前代码库现状：

1. 《家庭智能中控 Web App PRD v2.4》
2. 《家庭智能中控 Web App 接口清单 v2.4》
3. 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
4. 《家庭智能中控 Web App 前后端技术栈选型 v2.4》
5. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》
6. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》
7. 《家庭智能中控 Web App 接口冻结联调表 v2.4.1》
8. 《家庭智能中控 Web App 测试用例与验收清单 v2.4.1》
9. 当前前后端代码实现：`frontend/`、`backend/src/`

本报告不新增产品范围，只做口径收口、实施偏差识别与下一步修复建议。

---

## 二、冲突清单

### 2.1 编辑会话入口仍有历史残留 `GET`

冲突说明：

1. 《家庭智能中控 Web App 接口清单 v2.4》与《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》都已冻结为 `POST /api/v1/editor/sessions`。
2. 但《家庭智能中控 Web App 数据库模型初稿 v2.4》在 `draft_leases` 说明处仍残留 `GET /api/v1/editor/sessions` 表述。

本次修订：

1. 已将《家庭智能中控 Web App 数据库模型初稿 v2.4》中的残留入口统一改为 `POST /api/v1/editor/sessions`。

引用：

1. 《家庭智能中控 Web App 接口清单 v2.4》编辑态会话入口条目
2. 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》编辑锁错误语义条目
3. 《家庭智能中控 Web App 数据库模型初稿 v2.4》`draft_leases` 推导说明条目

### 2.2 WebSocket 身份来源在文档目标口径与当前实现之间不一致

冲突说明：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》“七、HTTP 鉴权规则”与“八、WebSocket 鉴权规则”把权威身份来源定义为 Bearer access token claim。
2. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“二、统一收口结论”已要求 `home_id / terminal_id` 以 token claim 为准。
3. 2026-04-17 收口后，当前实现已从“PIN session token + home_id/terminal_id 上下文为主”推进到“双栈兼容期”：
   - `backend/src/modules/auth/controllers/AuthController.py` 已签发 Bearer access token
   - `backend/src/modules/auth/services/query/RequestContextService.py` 已支持 Bearer/JWT 解析，并将 token claim 作为有 token 请求的权威身份来源
   - `backend/src/modules/realtime/RealtimeGateway.py` 已支持 `access_token` 与 `last_event_id`
   - `frontend/src/api/httpClient.ts` 已发送 `Authorization: Bearer <access_token>`
   - `frontend/src/ws/wsClient.ts` 已使用 `access_token` 建连，并在重连时携带 `last_event_id`
   - 旧 `home_id / terminal_id / token / pin_session_token` 路径仍作为兼容路径保留

结论：

1. 文档目标架构已是“Bearer access token 为身份主键，PIN session 为敏感操作附加态”。
2. 当前代码已经落地 Bearer 主链路，但尚未下线旧兼容路径；后续重点是观测兼容命中率、定义下线阈值并完成灰度移除。

引用：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》“二、结论”“七、HTTP 鉴权规则”“八、WebSocket 鉴权规则”“九、与 PIN Session 的关系”
2. 《家庭智能中控 Web App 接口清单 v2.4》“六、WebSocket 事件规范 / 6.1 连接信息”
3. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“二、统一收口结论”

代码证据：

1. `backend/src/modules/auth/controllers/AuthController.py`
2. `backend/src/modules/auth/services/query/RequestContextService.py`
3. `backend/src/modules/realtime/RealtimeGateway.py`
4. `frontend/src/api/httpClient.ts`
5. `frontend/src/ws/wsClient.ts`

### 2.3 WebSocket 重连补偿口径在文档内部曾出现“快照优先”残留

冲突说明：

1. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“七、last_event_id 重连补偿规则”已明确：先按 `last_event_id` 增量回放，失败再走 `snapshot_required=true` 的快照兜底。
2. 但《家庭智能中控 Web App 接口清单 v2.4》“6.7 重连与补偿规则”以及《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》“17.5 sequence 规则”此前仍偏向“重连后主动补拉快照”表述。
3. 当前代码其实已经实现了“增量优先、快照兜底”：
   - `backend/src/modules/realtime/RealtimeService.py:98-129` 先查 `last_event_id`
   - 查不到时发送 `snapshot_required=True` 的补偿提示事件

本次修订：

1. 已修订《家庭智能中控 Web App 接口清单 v2.4》“6.7 重连与补偿规则”。
2. 已修订《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》“17.5 sequence 规则”“17.9 建议补拉接口”。

引用：

1. 《家庭智能中控 Web App 接口清单 v2.4》“六、WebSocket 事件规范 / 6.7 重连与补偿规则”
2. 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》“十七、WebSocket 事件外壳规范 / 17.5 sequence 规则 / 17.9 建议补拉接口”
3. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“七、last_event_id 重连补偿规则”

代码证据：

1. `backend/src/modules/realtime/RealtimeService.py:98-129`
2. `backend/src/modules/realtime/RealtimeGateway.py:19-40`

### 2.4 前端技术栈文档与现有代码库只做到了“粗粒度一致”，未做到“实施级一致”

冲突说明：

1. 《家庭智能中控 Web App 前后端技术栈选型 v2.4》“二、冻结结论”“三、选型理由”只冻结到 `React + TypeScript + Vite`。
2. 当前前端代码已经形成更具体的实施事实：
   - React 19.1
   - React Router DOM 7.6
   - Vite 6.3
   - TypeScript 5.8
   - 自定义外部 Store，基于 `useSyncExternalStore`
   - 手写 `fetch` HTTP client
   - 手写 WebSocket client
   - 目前未接 OpenAPI 自动类型生成

结论：

1. 技术栈大方向与文档不冲突。
2. 但缺少“前端架构与接入方案”“OpenAPI 与前端类型生成规范”这类实施级文档，导致联调与后续重构缺少统一约束。

引用：

1. 《家庭智能中控 Web App 前后端技术栈选型 v2.4》“二、冻结结论”“五、前后端目录约定”
2. 《家庭智能中控 Web App 接口冻结联调表 v2.4.1》“二、统一执行口径”

代码证据：

1. `frontend/package.json:11-21`
2. `frontend/src/router.tsx:1-30`
3. `frontend/src/store/appStore.ts:1-247`
4. `frontend/src/api/httpClient.ts:10-53`
5. `frontend/src/ws/wsClient.ts:12-65`
6. `frontend/src/config/requestContext.ts:1-12`

### 2.5 鉴权方案文档与当前后端实现不一致，需要迁移计划而不是口头声明

冲突说明：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》把 Bearer access token 定义为 HTTP/WS 统一凭据。
2. 当前后端大量敏感服务仍以 `ManagementPinGuard.require_active_session(home_id, terminal_id)` 为核心控制面：
   - 设置保存
   - 编辑会话
   - Publish
   - 系统连接修改
   - 电量刷新/绑定
   - 媒体绑定
   - 备份恢复
3. `PinAuthController` 仍通过 `pin_session_token` cookie 建立会话。

结论：

1. 当前后端已落地 Bearer token 鉴权主干。
2. `v2.4.2` 后续必须把状态写成“Bearer 主链路已落地，旧兼容路径仍在观察期”，避免把“旧路径已下线”误写成已完成。

引用：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》“二、结论”“三、令牌类型与作用”“七、HTTP 鉴权规则”“八、WebSocket 鉴权规则”
2. 《家庭智能中控 Web App 接口冻结联调表 v2.4.1》“二、统一执行口径”
3. 《家庭智能中控 Web App 测试用例与验收清单 v2.4.1》认证与 WS 契约条目

代码证据：

1. `backend/src/modules/auth/controllers/PinAuthController.py:42-82`
2. `backend/src/modules/settings/services/command/SettingsSaveService.py:77-177`
3. `backend/src/modules/editor/services/EditorSessionService.py`
4. `backend/src/modules/editor/services/EditorPublishService.py:75-156`
5. `backend/src/modules/system_connections/services/SystemConnectionService.py:206-343`
6. `backend/src/modules/energy/services/EnergyService.py:78-148`
7. `backend/src/modules/media/services/MediaService.py:88-123`
8. `backend/src/modules/backups/services/BackupRestoreService.py:88-238`

---

## 三、修订建议

### 3.1 已完成的文档修订

1. 将《家庭智能中控 Web App 数据库模型初稿 v2.4》残留的 `GET /api/v1/editor/sessions` 改为 `POST /api/v1/editor/sessions`。
2. 将《家庭智能中控 Web App 接口清单 v2.4》与《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》的 WS 重连补偿统一为：
   - `last_event_id` 增量回放优先
   - `snapshot_required` 快照兜底
3. 将《家庭智能中控 Web App 鉴权方案说明 v2.4.1》补充为：
   - `home_id / terminal_id` 权威来源为 Bearer token claim
   - 外部参数仅用于兼容传输或诊断

### 3.2 本轮新增的 v2.4.2 执行文档

1. 《家庭智能中控 Web App 前端架构与接入方案 v2.4.2》
2. 《家庭智能中控 Web App 鉴权迁移与安全威胁模型 v2.4.2》
3. 《家庭智能中控 Web App OpenAPI 与前端类型生成规范 v2.4.2》
4. 《家庭智能中控 Web App 观测性、日志与审计规范 v2.4.2》
5. 《家庭智能中控 Web App CI/CD 与质量门禁规范 v2.4.2》

### 3.3 推荐收口口径

1. 文档层继续以《家庭智能中控 Web App 鉴权方案说明 v2.4.1》作为目标架构基线，即 Bearer token 负责身份，PIN session 负责敏感操作附加授权。
2. 实施层必须在《家庭智能中控 Web App 鉴权迁移与安全威胁模型 v2.4.2》中明确当前仍是兼容态，不得在任何执行文档中把 Bearer/JWT 写成“已完成”。
3. WebSocket 文档统一采用《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》与本次修订后的《接口清单 v2.4》《统一响应体与错误体规范 v2.4》双重对齐。

---

## 四、需要新增或修改的文档列表

### 4.1 已修改

1. `document/v2.4.1/家庭智能中控_Web_App_数据库模型初稿_v2.4.md`
2. `document/v2.4.1/《家庭智能中控 Web App 接口清单 v2.4》.md`
3. `document/v2.4.1/《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》.md`
4. `document/v2.4.1/家庭智能中控_Web_App_鉴权方案说明_v2.4.1.md`

### 4.2 已新增

1. `document/v2.4.2/家庭智能中控_Web_App_v2.4.2_一致性收口报告.md`
2. `document/v2.4.2/家庭智能中控_Web_App_前端架构与接入方案_v2.4.2.md`
3. `document/v2.4.2/家庭智能中控_Web_App_鉴权迁移与安全威胁模型_v2.4.2.md`
4. `document/v2.4.2/家庭智能中控_Web_App_OpenAPI与前端类型生成规范_v2.4.2.md`
5. `document/v2.4.2/家庭智能中控_Web_App_观测性_日志与审计规范_v2.4.2.md`
6. `document/v2.4.2/家庭智能中控_Web_App_CI_CD与质量门禁规范_v2.4.2.md`

---

## 五、不应修改的冻结业务规则

以下规则在 v2.4.2 收口中明确保持不变：

1. Save All 与 Publish 继续分离，不合并为单入口。  
引用：  
《家庭智能中控 Web App 接口清单 v2.4》设置保存与编辑发布接口条目；《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》`settings_updated`、`publish_succeeded` 条目。

2. `request_id` 幂等规则保持 `(home_id, request_id)` 唯一，不改为客户端无幂等模式。  
引用：  
《家庭智能中控 Web App 数据库ER图与关系说明 v2.4》唯一约束清单；《家庭智能中控 Web App Repository 接口定义代码骨架 v2.4.1》“关键一致性约束”。

3. 编辑态继续使用 `lease + heartbeat` 锁模型，不改为纯前端占位锁。  
引用：  
《家庭智能中控 Web App 接口清单 v2.4》`POST /api/v1/editor/sessions`、`/heartbeat`、`/takeover`；《家庭智能中控 Web App 数据库ER图与关系说明 v2.4》`draft_leases` 唯一约束。

4. `ws_event_outbox` 继续采用“先落库，再分发”的 outbox 规则，不允许直接跳过数据库推送 WS。  
引用：  
《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“九、后端约束”；《家庭智能中控 Web App 开发任务拆解与 Roadmap v2.4.1》“二、统一执行口径”。

5. `settings_updated`、`publish_succeeded`、`backup_restore_completed` 事件语义保持不变。  
引用：  
《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“六、冻结事件清单”；《家庭智能中控 Web App 接口清单 v2.4》“6.4 配置版本与恢复相关事件”。

---

## 六、下一步鉴权与观测性收口任务清单

2026-04-17 状态更新：

1. P1-1、P1-2、P1-3、P1-4 的主链路已经落地：Bearer 签发/校验、HTTP Authorization、WS `access_token`、WS `last_event_id` 已进入代码与 E2E。
2. WS 旧 `home_id / terminal_id / token / pin_session_token` 建连路径已进入 PR-1 移除，非 Bearer WS 建连在测试客户端返回 `4401`，真实握手拒绝为 HTTP `403`。
3. HTTP 运行时旧 `home_id / terminal_id / token / pin_session_token` 兼容路径已进入 PR-2 移除；`GET /api/v1/auth/session` 作为短期 bootstrap 入口暂保留旧 home/terminal。
4. 已新增 `/observabilityz` 聚合快照与结构化日志，用于观察 `auth_mode`、旧上下文字段命中率、WS accepted/rejected、incremental replay 与 snapshot fallback。
5. 后续 P1 从“实现 Bearer 主链路”调整为“真实 HA/预发长窗口复验，并替换 auth session bootstrap 旧 home/terminal 来源”。

### P1-1 统一请求上下文解析器（主链路已完成，兼容期继续观察）

目标：

1. 将 `RequestContextService` 从“session token + query/header home_id/terminal_id”迁移为“双栈兼容解析器”。
2. Bearer access token claim 成为身份权威来源。
3. 兼容阶段继续允许旧 `pin_session_token`，但仅作为过渡。

依据：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》“七、HTTP 鉴权规则”“八、WebSocket 鉴权规则”
2. 《家庭智能中控 Web App 鉴权迁移与安全威胁模型 v2.4.2》迁移阶段定义

### P1-2 新增或补齐 access token 签发与校验主干（已完成）

目标：

1. 明确 access token 的签发点、校验中间件、过期处理、撤销策略。
2. 保持 PIN session 仍以 `pin_sessions` 为真源，不把 PIN 状态塞进 token。

依据：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》“四、Token Payload”“五、过期与会话时长”“九、与 PIN Session 的关系”
2. 《家庭智能中控 Web App 鉴权迁移与安全威胁模型 v2.4.2》迁移步骤

### P1-3 改造 WebSocket 建连与重连参数（主链路已完成）

目标：

1. `/ws` 主路径改为 Bearer token + `last_event_id`。
2. `home_id`、`terminal_id` 若保留，只能做兼容诊断字段。
3. 重连链路统一按 `last_event_id` 增量优先。

依据：

1. 《家庭智能中控 Web App 接口清单 v2.4》“6.1 连接信息”“6.7 重连与补偿规则”
2. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“七、last_event_id 重连补偿规则”

### P1-4 改造前端 HTTP / WS 客户端（主链路已完成）

目标：

1. `frontend/src/api/httpClient.ts` 由 `x-home-id/x-terminal-id + query` 切换为 Bearer token。
2. `frontend/src/ws/wsClient.ts` 增加 token 与 `last_event_id`。
3. Store 层新增断线重连、事件去重、乱序补偿状态。

依据：

1. 《家庭智能中控 Web App 前端架构与接入方案 v2.4.2》
2. 《家庭智能中控 Web App OpenAPI 与前端类型生成规范 v2.4.2》
3. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“七、last_event_id 重连补偿规则”“八、前端去重与乱序处理规则”

### P1-5 补齐契约测试与迁移观察指标（进行中）

目标：

1. 为 Bearer 鉴权、旧会话兼容、WS 重连补偿建立接口契约测试。
2. 为迁移期间的旧参数使用率、无 token 建连、snapshot fallback 命中率建立日志与指标。

依据：

1. 《家庭智能中控 Web App 测试用例与验收清单 v2.4.1》
2. 《家庭智能中控 Web App 观测性、日志与审计规范 v2.4.2》
3. 《家庭智能中控 Web App CI/CD 与质量门禁规范 v2.4.2》

---

## 七、结论

v2.4.2 收口结论只有两点：

1. 文档冻结目标已经足够明确，当前真正需要的是把“目标口径”和“现状实现”分开写清楚。
2. 后端鉴权与前端接入是唯一的 P1 一致性断点，其他冻结业务规则不应在本轮被改动。
