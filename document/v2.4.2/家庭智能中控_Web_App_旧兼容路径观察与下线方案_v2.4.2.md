# 《家庭智能中控 Web App 旧兼容路径观察与下线方案 v2.4.2》

## 一、目的

本文件用于定义 `home_id / terminal_id / token / pin_session_token` 旧兼容路径的观察口径、下线阈值与移除 PR 范围。

当前结论：

1. Bearer access token 已经是 HTTP 与 WebSocket 主链路。
2. HTTP 旧兼容路径已拆分为“会话引导入口”和“运行时业务接口”：运行时业务接口已进入 PR-2 移除，`GET /api/v1/auth/session` 暂保留旧 home/terminal 引导。
3. 旧路径不能直接删除，必须先用 `/observabilityz` 和结构化日志证明主链路稳定。

## 二、本轮观察窗口

观察时间：2026-04-17 22:13:04 至 2026-04-17 22:14:11 +08:00

观察环境：

1. Docker Compose 本地预发式环境。
2. PostgreSQL、Redis、Backend、Frontend、Home Assistant 容器均启动。
3. 当前仓库未配置真实 `HOME_ASSISTANT_BOOTSTRAP_ACCESS_TOKEN`，因此本轮不能视为真实 HA token 联调。
4. 本轮流量来源为 M1/M2 Playwright 全栈 E2E。

执行结果：

```bash
npm run test:e2e
```

结果：`11 passed`

## 三、观测快照

`/observabilityz` 采集结果摘要：

HTTP：

1. `requests_total`: 193
2. `status_counts`: `200=190`, `202=1`, `409=2`
3. `auth_mode_counts`: `bearer=154`, `legacy_context=22`, `unresolved=17`

旧上下文字段命中：

1. `query.home_id`: 22
2. `query.terminal_id`: 22
3. `cookie.home_id`: 25
4. `cookie.terminal_id`: 25
5. `cookie.pin_session_token`: 25

WebSocket：

1. `connections_total`: 11
2. `auth_mode_counts`: `bearer=11`
3. `resume_counts`: `no_last_event_id=11`
4. `events_sent_total`: 9
5. `snapshot_required_events_total`: 4

结构化日志验证：

1. `http_request` 日志已进入 backend stdout。
2. `websocket_connection` 日志已进入 backend stdout。
3. 本轮窗口未出现 `websocket_resume` 日志，因为 E2E 产生的 WS 建连均未携带 `last_event_id` 进入服务端恢复路径。

## 四、命中率判断

HTTP Bearer 主链路占比：

1. 按总 HTTP 请求计：`154 / 193 = 79.8%`
2. 排除 `unresolved` 探针/公开请求后：`154 / (154 + 22) = 87.5%`

HTTP 旧兼容 auth_mode 占比：

1. 按总 HTTP 请求计：`22 / 193 = 11.4%`
2. 排除 `unresolved` 后：`22 / (154 + 22) = 12.5%`

WS Bearer 占比：

1. `11 / 11 = 100%`

结论：

1. WS 旧鉴权路径已经进入 PR-1 下线实施。
2. HTTP 旧上下文仍被会话引导链路使用，但运行时业务接口已进入 PR-2 移除。
3. 当前拆分口径为：`GET /api/v1/auth/session` 负责短期 bootstrap，其他运行时 `/api/v1/*` 请求必须使用 `Authorization: Bearer <access_token>`。

## 五、下线阈值

### 5.1 WS 旧路径下线阈值

满足以下条件后，可以提交 WS 旧路径移除 PR：

1. 连续 3 次全栈 E2E 中 `websocket.auth_mode_counts.bearer == websocket.connections_total`。
2. 连续 3 次全栈 E2E 中 `websocket.auth_mode_counts.legacy_pin_session` 与 `legacy_context` 均为 0。
3. 真实或预发 HA 联调窗口中无 `/ws?token=`、`/ws?home_id=`、`/ws?terminal_id=` 命中。
4. `last_event_id` 增量恢复和 snapshot fallback 至少各有一条集成测试或 E2E 证据。

建议阈值：

1. WS 旧 token/query 路径命中率：`0%`
2. 观察窗口：至少 24 小时预发流量，或 3 次独立全栈验收。

### 5.2 HTTP 旧路径下线阈值

满足以下条件后，可以提交 HTTP 旧上下文移除 PR：

1. `GET /api/v1/auth/session` 不再依赖裸 `home_id / terminal_id` query/header 作为身份来源。
2. 已替换为明确的引导机制，例如：
   - 受控终端配置中的固定 home/terminal bootstrap 配置；
   - 或签名 bootstrap token；
   - 或后端预注册 terminal cookie；
   - 或安装期绑定流程。
3. 除引导接口外，所有 `/api/v1/*` 请求 `auth_mode=legacy_context` 为 0。
4. `query.home_id`、`query.terminal_id`、`header.x-home-id`、`header.x-terminal-id` 只允许在明确标记的 bootstrap 流程中出现。
5. 真实或预发 HA 联调窗口中旧上下文字段命中率低于阈值。

建议阈值：

1. 运行时业务接口旧上下文命中率：`0%`
2. 引导接口旧上下文命中率：允许短期存在，但必须单独统计，不得混入运行时鉴权。
3. 观察窗口：至少 7 天预发/目标部署环境，或连续 5 次全栈验收均满足。

### 5.3 PIN session 下线阈值

`pin_session_token` 不应与 `home_id / terminal_id / token` 同批删除。

原因：

1. PIN session 是敏感操作附加授权真源。
2. 当前 Save All、Publish、系统连接、电量绑定、媒体绑定、备份恢复仍依赖 PIN session。

建议：

1. 本轮仅下线“把 PIN session 当作全局身份凭据”的行为。
2. 保留 PIN session 作为敏感操作授权状态。
3. 后续如要调整 PIN session，应另立安全设计与威胁模型。

## 六、移除 PR 范围建议

### PR-1：WS 旧参数移除

状态：2026-04-17 已完成本地实现与回归验证，仍需真实 HA 长窗口复验。

目标：

1. 移除 `/ws` 的 `home_id`、`terminal_id`、`token` 兼容入口。
2. 拒绝 cookie-backed `pin_session_token` 作为 WS 建连身份。
3. `/ws` 只接受 Bearer 语义 access token 与 `last_event_id`。
4. 旧 WS 建连尝试记录为 `websocket_rejected` 结构化日志，并进入 `/observabilityz` 的 `websocket.rejected_*` 计数。
5. 保留 `last_event_id` 重连补偿。

涉及文件：

1. `backend/src/modules/realtime/RealtimeGateway.py`
2. `backend/tests/integration/test_realtime_ws.py`
3. `frontend/src/ws/wsClient.ts`
4. `frontend/e2e/m1-smoke.spec.ts`
5. `document/v2.4.2/*`

验收：

1. 后端 pytest 全绿。
2. 前端 build 全绿。
3. Docker + Playwright E2E 全绿。
4. `/observabilityz` 显示 WS `bearer == connections_total`，且旧路径尝试进入 `websocket.rejected_total` 与 `websocket.rejected_legacy_context_field_counts`。
5. `/ws?token=` 与 cookie-backed WS 在集成测试中返回 `4401`；真实网络握手在 accept 前被拒绝时表现为 HTTP `403`，同时必须落 `websocket_rejected` 日志。

本地验证结果（2026-04-17 22:33 +08:00）：

1. `python -m pytest tests`：`71 passed`
2. `npm run build`：通过
3. `docker compose up -d --build backend`：通过，backend 健康启动
4. `npm run test:e2e`：`11 passed`
5. `/observabilityz`：`websocket.connections_total=11`，`websocket.auth_mode_counts.bearer=11`，`websocket.rejected_total=2`
6. 旧路径负向探针：`/ws?token=legacy-session-token` 与 cookie `pin_session_token=pin-session-cookie` 均被真实网络握手拒绝为 HTTP `403`
7. `websocket.rejected_legacy_context_field_counts`：`query.token=1`，`cookie.pin_session_token=1`

### PR-2：HTTP 运行时旧上下文移除

状态：2026-04-17 已完成本地实现与回归验证，仍需真实 HA/预发长窗口复验。

目标：

1. 业务接口不再从 query/header/cookie 推导 `home_id / terminal_id`。
2. 有 Bearer token 时继续拒绝 claim 与外部上下文不一致的请求。
3. 无 Bearer token 的运行时业务接口直接 `401`。
4. HTTP 运行时不接受 query/cookie/explicit `access_token` 作为 Bearer 传输通道；HTTP Bearer 只走 `Authorization` header。
5. `/api/v1/auth/pin/session` 移除 `home_id / terminal_id` query 参数，改为从 Bearer claim 获取上下文。

前置：

1. 已完成运行时与会话引导入口拆分。
2. PR-4 后，`GET /api/v1/auth/session?home_id=&terminal_id=` 旧引导已下线；会话引导由签名 bootstrap token 与终端激活入口承接。

涉及文件：

1. `backend/src/modules/auth/services/query/RequestContextService.py`
2. `frontend/src/api/httpClient.ts`
3. `frontend/src/api/authApi.ts`
4. 已删除前端 `includeLegacyContext` 自动拼接旧上下文字段能力
5. 后端鉴权与 OpenAPI 契约测试

验收：

1. 业务接口 `auth_mode=legacy_context` 为 0。
2. `legacy_context.field_counts.query.home_id/query.terminal_id` 在业务接口为 0。
3. `401` 契约覆盖无 Bearer 的业务请求。
4. M1/M2 E2E 全绿。

本地验证结果（2026-04-17 22:48 +08:00）：

1. `python -m pytest tests`：`74 passed`
2. `npm run build`：通过
3. `docker compose up -d --build backend frontend`：通过
4. `npm run test:e2e`：`11 passed`
5. `npm run generate:api-types`：通过，`/api/v1/auth/pin/session` 已从 OpenAPI 与前端生成类型中移除 `home_id / terminal_id` query 参数
6. 负向探针：
   - `GET /api/v1/settings?home_id=...&terminal_id=...` 无 Bearer 返回 `401 UNAUTHORIZED`
   - `GET /api/v1/settings` 仅带 `x-home-id/x-terminal-id` 返回 `401 UNAUTHORIZED`
   - `GET /api/v1/settings?access_token=<valid>` 无 `Authorization` header 返回 `401 UNAUTHORIZED`
   - `GET /api/v1/auth/pin/session?home_id=...&terminal_id=...` 无 Bearer 返回 `401 UNAUTHORIZED`
   - `GET /api/v1/device-controls/{request_id}?home_id=...` 无 Bearer 返回 `401 UNAUTHORIZED`
7. PR-4 后旧引导口已下线：`GET /api/v1/auth/session?home_id=...&terminal_id=...` 无 Bearer 返回 `401`

本地预发式长窗口复验（2026-04-17 22:59:16 至 23:29:18 +08:00）：

说明：当前 backend 容器未注入 `HOME_ASSISTANT_BOOTSTRAP_ACCESS_TOKEN`，因此本轮不能声明为真实外部 HA token 联调。系统连接表内已有保存的 Home Assistant 连接，目标为本地 compose HA，状态为 `CONNECTED`。本轮结论按“本地预发式 HA 长窗口”归档。

1. 窗口长度：30 分钟
2. 轮次：11 轮，每轮执行 auth bootstrap、PIN verify、HA saved-config test、设备 reload、设备列表、settings、Bearer WS 建连
3. 失败数：0
4. 每轮 HA test：`CONNECTED`
5. 每轮设备 reload：`ACCEPTED`，结果为 `Reloaded 3 devices, 34 entities across 2 rooms`
6. 最终 `/observabilityz`：
   - HTTP `requests_total=275`
   - HTTP `status_counts`: `200=270`, `401=5`
   - HTTP `auth_mode_counts`: `bearer=57`, `unresolved=206`, `legacy_context=1`, `legacy_pin_session=11`
   - WS `connections_total=12`, `auth_mode_counts.bearer=12`
7. backend `http_request` 日志精确分类：
   - accepted runtime legacy count：`0`
   - accepted `/api/v1/auth/session` bootstrap legacy count：`13`
   - controlled old-context negative probes：`5`，全部 `401`
8. 受控负向探针：
   - `/api/v1/settings?home_id=...&terminal_id=...`：`401`
   - `/api/v1/settings` + `x-home-id/x-terminal-id`：`401`
   - `/api/v1/settings?access_token=<valid>`：`401`
   - `/api/v1/auth/pin/session?home_id=...&terminal_id=...`：`401`
   - `/api/v1/device-controls/{request_id}?home_id=...`：`401`
9. 原始窗口日志：`soak-results/preprod_http_runtime_soak_20260417_225913.ndjson`

### PR-3A：auth session bootstrap 观测拆分

状态：2026-04-17 已进入本地实现与回归验证。

目标：

1. 把 `GET /api/v1/auth/session` 的 legacy bootstrap 命中从 HTTP runtime legacy 指标中拆出。
2. `/observabilityz.legacy_context.field_counts` 只代表 runtime 路径旧字段命中。
3. `/observabilityz.legacy_context.runtime_accepted_requests_total` 作为 PR-2 长窗口复验的主判据。
4. `/observabilityz.auth_session_bootstrap.*` 单独统计旧引导入口的请求量、状态码、auth_mode 与旧字段命中。
5. `http_request` 日志增加 `observability_scope`；PR-4 后旧引导成功路径和 `auth_session_bootstrap_legacy` 事件已删除。

涉及文件：

1. `backend/src/shared/observability/Observability.py`
2. `backend/src/main.py`
3. `backend/tests/integration/test_supporting_routes.py`
4. `document/v2.4.2/*`

验收：

1. 后端 pytest 全绿。
2. 前端 build 全绿。
3. `/api/v1/auth/session?home_id=...&terminal_id=...` 的旧引导命中只增加 `auth_session_bootstrap.legacy_requests_total`。
4. 同一次请求不增加 `legacy_context.field_counts`。
5. 业务接口旧上下文负向探针仍返回 `401`，且 runtime legacy accepted 保持为 0。

长窗口观察口径：

1. PR-3A 后不再需要通过日志路径名手工扣除 `/api/v1/auth/session`。
2. PR-2 的运行时下线阈值直接读取 `legacy_context.runtime_accepted_requests_total == 0`。
3. 旧引导入口迁移进度读取 `auth_session_bootstrap.legacy_requests_total`，后续由 PR-3B/PR-3C 降到 0。

### PR-3B：bootstrap token 数据模型与兑换接口

状态：2026-04-18 已完成本地实现与回归验证。

目标：

1. 新增 terminal bootstrap token 存储、哈希、撤销和 last used 记录。
2. 新增 `POST /api/v1/auth/session/bootstrap`，使用 `Authorization: Bootstrap <bootstrap_token>` 换取 Bearer access token。
3. 新增受 Bearer + PIN session 保护的 bootstrap token 创建或重置接口。
4. 新增单元测试、集成测试、OpenAPI 契约测试与前端生成类型。

验收：

1. bootstrap token 明文只在创建或重置响应中出现一次。
2. 后端日志不记录 bootstrap token 明文。
3. 兑换接口成功签发 `scope=["api","ws"]` 的 access token。
4. 被撤销、过期或未知 jti 的 bootstrap token 返回 `401`。

涉及文件：

1. `backend/alembic/versions/20260418_0002_terminal_bootstrap_tokens.py`
2. `backend/src/modules/auth/services/query/BootstrapTokenResolver.py`
3. `backend/src/modules/auth/services/command/BootstrapTokenService.py`
4. `backend/src/infrastructure/db/repositories/base/auth/TerminalBootstrapTokenRepositoryImpl.py`
5. `backend/src/modules/auth/controllers/AuthController.py`
6. `backend/src/modules/auth/controllers/TerminalBootstrapController.py`
7. `backend/src/app/container.py`
8. `backend/tests/unit/test_bootstrap_token_resolver.py`
9. `backend/tests/unit/test_bootstrap_token_service.py`
10. `backend/tests/integration/test_supporting_routes.py`
11. `backend/tests/integration/test_openapi_contract.py`

本地验证结果（2026-04-18）：

1. `python -m pytest tests`：`82 passed`
2. `npm run build`：通过
3. `docker compose up -d --build backend frontend`：通过
4. 容器 API 闭环：
   - legacy `/api/v1/auth/session?home_id=&terminal_id=` 取得 Bearer access token
   - PIN verify 产生 active PIN session
   - `POST /api/v1/terminals/{terminal_id}/bootstrap-token` 返回 `token_type=Bootstrap` 与 `scope=bootstrap:session`
   - `POST /api/v1/auth/session/bootstrap` 返回 `token_type=Bearer` 与 `scope=api,ws`
5. 重置校验：第二次创建/重置后，旧 bootstrap token 兑换返回 `401`，新 bootstrap token 兑换成功。
6. `/observabilityz`：`auth_session_bootstrap.auth_mode_counts.bootstrap_token` 增加，`legacy_context.runtime_accepted_requests_total` 保持为 0。
7. `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5173'; npm run test:e2e`：`11 passed`

### PR-3C：前端切换与旧引导关闭

状态：2026-04-18 已完成本地实现与回归验证。

目标：

1. 前端优先用本地 bootstrap token 调用 `/api/v1/auth/session/bootstrap`。
2. 旧 `/api/v1/auth/session?home_id=&terminal_id=` 默认关闭，仅保留临时环境变量回滚开关。
3. 长窗口确认 `auth_session_bootstrap.legacy_requests_total` 归零后，删除旧 query/header 引导路径。

验收：

1. M1/M2 E2E 全绿。
2. 真实 HA/预发长窗口中 runtime legacy accepted 为 0。
3. 真实 HA/预发长窗口中旧 auth session bootstrap 为 0。
4. OpenAPI 与前端生成类型不再暴露旧引导参数。

涉及文件：

1. `backend/src/modules/auth/controllers/AuthController.py`
2. `backend/src/shared/config/Settings.py`
3. `docker-compose.yml`
4. `frontend/src/auth/bootstrapToken.ts`
5. `frontend/src/api/httpClient.ts`
6. `frontend/src/api/authApi.ts`
7. `frontend/e2e/m1-smoke.spec.ts`
8. `scripts/preprod_http_runtime_soak.py`

本地验证结果（2026-04-18）：

1. `python -m pytest tests`：`83 passed`
2. `npm run build`：通过
3. `python -m py_compile scripts/preprod_http_runtime_soak.py`：通过
4. `docker compose up -d --build backend frontend`：通过
5. 旧 query 引导默认关闭：`GET /api/v1/auth/session?home_id=&terminal_id=` 返回 `401`
6. Bootstrap token 兑换 Bearer 成功：`POST /api/v1/auth/session/bootstrap` 返回 `token_type=Bearer`、`scope=api,ws`
7. `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5173'; npm run test:e2e`：`11 passed`
8. `/observabilityz`：
   - `auth_session_bootstrap.auth_mode_counts.bootstrap_token=19`
   - `auth_session_bootstrap.legacy_requests_total=0`
   - `legacy_context.runtime_accepted_requests_total=0`
   - `websocket.auth_mode_counts.bearer=12`
   - `websocket.connections_total=12`

### PR-3D：终端激活 / bootstrap token 配置入口

状态：2026-04-18 已完成本地实现与回归验证。

目标：
1. 当前端没有本地 bootstrap token 时，进入明确的终端激活入口。
2. 支持用户粘贴管理端签发或重置得到的 bootstrap token。
3. 激活成功后保存 `localStorage["smart_home.bootstrap_token"]` 并进入现有中控 shell。
4. 激活失败或旧 token 失效时清理本地旧 token，停留在激活页等待重新输入。
5. 保持业务接口只走 Bearer，不恢复任何旧 `home_id / terminal_id / token` 运行时兼容路径。

涉及文件：
1. `frontend/src/api/authApi.ts`
2. `frontend/src/system/AppBootstrap.tsx`
3. `frontend/src/pages/TerminalActivationPage.tsx`
4. `frontend/src/styles/layout.css`
5. `frontend/e2e/m1-smoke.spec.ts`

本地验证结果（2026-04-18）：

1. `npm run build`：通过
2. `docker compose up -d --build frontend`：通过
3. `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:25173'; npx playwright test e2e/m1-smoke.spec.ts -g "terminal activation stores bootstrap token and enters shell"`：`1 passed`
4. `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:25173'; npm run test:e2e`：`12 passed`

### PR-4：最终兼容清理

状态：2026-04-18 已完成本地实现与回归验证。旧路径当前口径为：已下线。

目标：

1. 删除旧 `GET /api/v1/auth/session?home_id=&terminal_id=` legacy fallback。
2. 删除 `AUTH_SESSION_LEGACY_BOOTSTRAP_ENABLED` / `VITE_AUTH_SESSION_LEGACY_BOOTSTRAP_ENABLED` 回滚路径。
3. 删除前端 `includeLegacyContext` 自动拼接旧上下文字段能力。
4. 将鉴权状态从“兼容观察期”更新为“旧路径已下线”。
5. 保留 PIN session 作为敏感操作附加授权的说明。

验收：

1. 旧 query 引导无 Bearer 时返回 `401`，不再存在环境变量回滚开关。
2. 前端无 bootstrap token 时只进入终端激活页，不再回退旧 query 引导。
3. soak 脚本只接受 `SOAK_BOOTSTRAP_TOKEN`，不再支持 `SOAK_ALLOW_LEGACY_BOOTSTRAP`。
4. `/observabilityz` 仍保留 auth_mode 与 WS 指标，用于后续回归观察。
5. 文档口径标记为“旧路径已下线”。

本地验证结果（2026-04-18）：

1. `python -m pytest tests`：`83 passed`
2. `python -m py_compile scripts/preprod_http_runtime_soak.py`：通过
3. `npm run build`：通过
4. `docker compose up -d --build backend frontend`：通过
5. `GET /api/v1/auth/session?home_id=&terminal_id=`：返回 `401`
6. `POST /api/v1/auth/session/bootstrap`：Bootstrap token 兑换 Bearer 成功，返回 `scope=["api","ws"]`
7. 容器环境变量检查：`AUTH_SESSION_LEGACY_BOOTSTRAP_ENABLED` 不存在
8. `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:25173'; npm run test:e2e`：`12 passed`

## 七、真实 HA 联调要求

本轮未配置真实 HA token，下一次真实联调必须补齐：

1. `HOME_ASSISTANT_BOOTSTRAP_ACCESS_TOKEN`
2. 真实 HA `base_url`
3. 至少 1 个可读实体与 1 个可控实体
4. 设备 reload、设备控制、HA WS 同步、断线恢复日志

真实 HA 联调通过标准：

1. HA 连接状态为 `CONNECTED`。
2. reload 后设备目录可见真实实体。
3. 至少 1 次控制请求返回最终结果。
4. 后端结构化日志不包含 token 明文。
5. `/observabilityz` 中 WS 为 Bearer，业务接口旧上下文命中率符合下线阈值。
