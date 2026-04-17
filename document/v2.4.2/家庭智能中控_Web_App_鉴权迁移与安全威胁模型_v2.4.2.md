# 《家庭智能中控 Web App 鉴权迁移与安全威胁模型 v2.4.2》

## 一、文档目标

本文件用于解决以下断点：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》已经冻结为 Bearer access token 目标口径。
2. 截至 2026-04-17，Bearer access token 主链路已经在 HTTP 与 WebSocket 中落地。
3. 当前仍保留 `home_id + terminal_id + PIN session` 兼容模型，因此必须定义迁移观察、下线条件与安全边界。

引用：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》“二、结论”“三、令牌类型与作用”“七、HTTP 鉴权规则”“八、WebSocket 鉴权规则”“九、与 PIN Session 的关系”
2. 《家庭智能中控 Web App 接口清单 v2.4》“六、WebSocket 事件规范 / 6.1 连接信息”
3. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“二、统一收口结论”

---

## 二、当前实现现状

### 2.1 后端

当前后端实现事实：

1. `AuthController` 会签发带 `home_id / terminal_id / role / scope / jti / exp` 的 Bearer access token。
2. `RequestContextService` 已支持真实 Bearer/JWT 解析，并将 token claim 作为权威身份来源。
3. 当 Bearer claim 与 query/header/cookie 传入的 `home_id / terminal_id` 不一致时，请求会被拒绝。
4. HTTP 运行时旧 `home_id / terminal_id / token / pin_session_token` 兼容路径已在 PR-2 中改为拒绝；`GET /api/v1/auth/session` 暂保留旧 home/terminal 引导以签发 Bearer access token。
5. 多个敏感服务仍直接调用 `ManagementPinGuard.require_active_session(home_id, terminal_id)`，PIN session 继续作为敏感操作附加授权真源。
6. `/observabilityz` 已提供聚合指标快照，用于观察 `auth_mode`、旧上下文字段命中率、WS accepted/rejected、重连补偿与 snapshot fallback。

代码依据：

1. `backend/src/modules/auth/services/query/RequestContextService.py`
2. `backend/src/modules/auth/controllers/PinAuthController.py`
3. `backend/src/modules/settings/services/command/SettingsSaveService.py`
4. `backend/src/modules/editor/services/EditorPublishService.py`

### 2.2 前端

当前前端实现事实：

1. HTTP client 已在存在 access token 时发送 `Authorization: Bearer <access_token>`。
2. WS client 已使用 `access_token` 建连，并在重连时携带 `last_event_id`。
3. access token 当前保存在前端内存态，刷新页面后通过本地 bootstrap token 调用 `POST /api/v1/auth/session/bootstrap` 重新签发。
4. `includeLegacyContext` 已移除，前端不再自动拼接旧 `home_id / terminal_id` 上下文。

代码依据：

1. `frontend/src/api/httpClient.ts`
2. `frontend/src/ws/wsClient.ts`
3. `frontend/src/config/requestContext.ts`

---

## 三、目标架构

目标架构保持《家庭智能中控 Web App 鉴权方案说明 v2.4.1》冻结口径：

1. Access token 负责身份识别：
   - `home_id`
   - `terminal_id`
   - `role`
   - `scope`
2. PIN session 负责敏感操作附加授权。
3. HTTP 与 WS 使用同一套 Bearer token 语义。
4. `home_id / terminal_id` 的权威来源为 token claim。

本轮不改变的规则：

1. Save All / Publish 分离
2. `request_id` 幂等
3. `lease + heartbeat` 编辑锁
4. `ws_event_outbox` 先落库再分发

---

## 四、迁移原则

1. 先双栈兼容，再切主路径，不做一步到位替换。
2. PIN session 不并入 access token claim。
3. 敏感操作的 PIN 校验真源仍在 `pin_sessions`。
4. 每一阶段都必须可回滚。
5. 迁移期间必须记录旧协议使用率。

---

## 五、迁移计划

### 阶段 A：引入 Bearer 主干但不切流（已完成）

目标：

1. 后端新增 access token 签发、验签、过期校验能力。
2. `RequestContextService` 支持真实 JWT/Bearer 解析。
3. 旧 `pin_session_token + home_id + terminal_id` 模型继续可用。

完成标准：

1. HTTP 能同时识别 Bearer token 与旧兼容模式。
2. WS 曾在兼容期同时识别 Bearer token 与旧 `token` 参数；2026-04-17 PR-1 开始后，WS 旧 `token` 参数已进入下线移除。
3. 日志中能区分：
   - `auth_mode=bearer`
   - `auth_mode=legacy_pin_session`

### 阶段 B：前端切到 Bearer

状态：主链路已完成。HTTP 运行时兼容路径已进入 PR-2 移除；WS 兼容路径已进入 PR-1 移除。

目标：

1. HTTP client 改为发送 `Authorization: Bearer <access_token>`。
2. WS client 改为 Bearer token 语义建连，并携带 `last_event_id`。
3. 页面层不再显式依赖 `home_id / terminal_id` query/header。

完成标准：

1. 主流程页面不再依赖 `x-home-id / x-terminal-id`。
2. 兼容参数仅在降级路径启用。

### 阶段 C：后端把 Bearer claim 设为唯一权威来源

状态：进行中。Bearer claim 已成为运行时请求的权威来源；HTTP 运行时旧 session/context 路径已开始拒绝无 Bearer 请求；WS 已开始拒绝非 Bearer 建连。

目标：

1. `home_id / terminal_id` 来自 claim。
2. query/header 中同名字段只做兼容诊断，不再参与权限决策。
3. 不一致请求直接拒绝。

完成标准：

1. `RequestContextService` 不再从 header/query 推导权威 home/terminal。
2. 所有控制器与服务都以统一上下文对象读取身份。

### 阶段 D：下线旧兼容路径

状态：分阶段进行中。WS 旧路径已完成本地移除验证；HTTP 运行时旧路径已完成本地移除验证；会话引导入口仍需后续替换与长窗口复验。

目标：

1. 下线 `x-home-id / x-terminal-id` 鉴权依赖。
2. 下线把 `pin_session_token` 当作全局身份凭据的行为。

完成标准：

1. 文档、前端、后端、测试、CI 同步切换完成。
2. 兼容日志命中率降到可接受阈值后移除旧路径。

---

## 六、安全威胁模型

### 6.1 终端重放

风险：

1. 盗取 token 后在其他终端重放。

控制：

1. token claim 固定 `terminal_id`。
2. 请求上下文若传入其他 `terminal_id`，直接拒绝。
3. 审计日志记录 `terminal_id`、`client_ip`、`jti`。

依据：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》“六、终端绑定规则”

### 6.2 查询参数篡改

风险：

1. 通过 query/header 修改 `home_id / terminal_id` 冒充上下文。

控制：

1. 只信任 token claim。
2. 外部参数仅作兼容传输与诊断。
3. 参数与 claim 不一致时拒绝请求。

依据：

1. 《家庭智能中控 Web App 接口清单 v2.4》“6.1 连接信息”
2. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》“八、WebSocket 鉴权规则”

### 6.3 PIN 会话固定与跨终端复用

风险：

1. 旧 `pin_session_token` 被固定或在其他终端复用。

控制：

1. PIN session 继续绑定 `(home_id, terminal_id)`。
2. 所有敏感操作再次核验 active PIN session。
3. PIN session 过期后主动失活。

依据：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》“三、令牌类型与作用”“五、过期与会话时长”“九、与 PIN Session 的关系”

### 6.4 WebSocket 事件缺口

风险：

1. 重连后直接依赖快照，丢失中间事件。
2. 客户端把旧事件重复应用。

控制：

1. `last_event_id` 增量补偿优先。
2. `snapshot_required` 作为兜底。
3. 前端保存最近处理的 `event_id` 与 `sequence`。

依据：

1. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“七、last_event_id 重连补偿规则”“八、前端去重与乱序处理规则”

### 6.5 Cookie 与 CSRF 风险

风险：

1. 当前前端 `credentials: include` 且后端通过 cookie 维护 `pin_session_token`。

控制：

1. Bearer access token 迁移完成后，基础身份不再依赖 cookie。
2. `pin_session_token` 仅保留为敏感操作附加态。
3. 敏感接口记录审计日志并要求同终端绑定。

---

## 七、最小验收标准

1. Bearer token 与 PIN session 的职责在代码中可分离追踪。
2. 旧协议兼容路径可监控、可灰度、可移除。
3. WS 身份来源与重连补偿不再存在双口径。
4. 所有文档都应区分“Bearer 主链路已落地”和“旧兼容路径已下线”，不得把两者混写。

---

## 八、结论

当前已经不是“要不要上 Bearer”的问题，而是“如何在不破坏现有 PIN 保护规则的前提下，观察并下线旧兼容路径”。后续迁移必须以双栈兼容、审计可观测和可回滚为前提。
