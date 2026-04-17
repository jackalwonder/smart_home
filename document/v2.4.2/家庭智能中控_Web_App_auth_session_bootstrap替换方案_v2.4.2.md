# 家庭智能中控 Web App auth session bootstrap 替换方案 v2.4.2

## 一、背景

PR-1 已移除 WebSocket 旧身份路径，PR-2 已让 HTTP 运行时业务接口默认要求 `Authorization: Bearer <access_token>`。

历史上曾保留的旧入口是：

```http
GET /api/v1/auth/session?home_id=...&terminal_id=...
```

该入口曾用于为终端首次取得 Bearer access token。PR-4 后该入口已下线；终端首次启动必须使用 bootstrap token 兑换 Bearer access token。

## 二、目标

1. `/api/v1/auth/session` 不再接受裸 `home_id / terminal_id` 作为身份引导凭据。
2. 运行时业务接口继续只接受 `Authorization: Bearer <access_token>`。
3. PIN session 继续作为敏感操作附加授权，不并入 access token。
4. 支持固定家用中控终端的低摩擦启动体验。
5. 替换过程可灰度、可观测、可回滚。

## 三、非目标

1. 不在本阶段移除 PIN 校验。
2. 不把 Home Assistant token 当作 App 登录凭据。
3. 不引入第三方 OAuth 登录。
4. 不要求用户每次打开页面都重新绑定终端。

## 四、候选方案

### 方案 A：签名 bootstrap token

终端安装或预注册时获得一个长期或中期 bootstrap token。首次调用 `/api/v1/auth/session` 时传：

```http
POST /api/v1/auth/session/bootstrap
Authorization: Bootstrap <bootstrap_token>
```

服务端验证 bootstrap token 后签发短期 Bearer access token。

优点：

1. 改造面小。
2. 可以保留无账号、固定家庭中控的产品形态。
3. 易于审计和撤销。

风险：

1. bootstrap token 需要安全存储。
2. 若 token 长期不轮换，泄漏后影响较大。

控制：

1. bootstrap token 只授予 `bootstrap:session` 用途，不可直接访问业务接口。
2. token payload 固定 `home_id`、`terminal_id`、`terminal_mode`、`jti`、`exp`。
3. 服务端保存 bootstrap token 哈希、状态、最近使用时间、撤销时间。
4. 每次 bootstrap 成功后可选择旋转 token。

### 方案 B：终端预注册 secret

后端为每个终端保存 `terminal_secret_hash`。终端本地保存 secret，请求时提交：

```http
POST /api/v1/auth/session/bootstrap
{
  "terminal_id": "...",
  "terminal_secret": "..."
}
```

优点：

1. 概念直接，适合固定屏幕设备。
2. 可以与终端资产表天然绑定。

风险：

1. 明文 secret 容易被误写入日志或配置。
2. 需要额外设计 secret 展示、重置和轮换流程。

控制：

1. secret 只在创建或重置时展示一次。
2. 数据库存哈希，不存明文。
3. 请求日志只记录 `terminal_id` 和 secret hash 前缀，不记录 secret。

### 方案 C：安装期绑定码

首次启动展示绑定码，用户在已授权管理端输入绑定码完成终端绑定。绑定成功后服务端下发 bootstrap token 或 terminal secret。

优点：

1. 对未知终端更安全。
2. 适合多终端自助注册。

风险：

1. 交互链路更长。
2. 当前产品还没有独立管理端，落地成本较高。

控制：

1. 绑定码短时有效。
2. 绑定码只能使用一次。
3. 绑定完成后进入方案 A 或 B。

## 五、推荐路径

推荐分两步走：

1. 先落地方案 A：签名 bootstrap token。
2. 后续在需要新增终端自助注册时，再补方案 C：安装期绑定码。

原因：

1. 当前系统已有 access token 签发与校验能力，扩展 bootstrap token 成本最低。
2. 固定家庭中控场景不需要每次人机登录。
3. 方案 A 可以快速替换裸 `home_id / terminal_id`，立刻降低暴露面。

## 六、接口草案

### 6.1 创建或重置终端 bootstrap token

管理操作，必须 Bearer + PIN session。

```http
POST /api/v1/terminals/{terminal_id}/bootstrap-token
Authorization: Bearer <access_token>
```

响应：

```json
{
  "success": true,
  "data": {
    "terminal_id": "22222222-2222-2222-2222-222222222222",
    "bootstrap_token": "<one-time-visible-token>",
    "expires_at": "2026-05-17T00:00:00Z",
    "token_type": "Bootstrap",
    "scope": ["bootstrap:session"],
    "rotated": true
  },
  "error": null,
  "meta": {
    "trace_id": "...",
    "server_time": "..."
  }
}
```

### 6.2 使用 bootstrap token 换取 access token

```http
POST /api/v1/auth/session/bootstrap
Authorization: Bootstrap <bootstrap_token>
```

响应沿用 `AuthSessionResponse`，返回 `access_token`、`scope`、`features` 与 PIN session 状态。

### 6.3 已下线旧入口

以下旧入口已下线，不再作为会话引导或回滚路径：

```http
GET /api/v1/auth/session?home_id=...&terminal_id=...
```

当前行为：

1. 无 Bearer 的旧 query 请求返回 `401`。
2. 前端不再提供 `VITE_AUTH_SESSION_LEGACY_BOOTSTRAP_ENABLED` 回退。
3. 后端不再提供 `AUTH_SESSION_LEGACY_BOOTSTRAP_ENABLED` 回滚开关。
4. `/observabilityz.auth_session_bootstrap.legacy_requests_total` 仅作为历史回归观察字段保留，目标值恒为 `0`。

## 七、数据模型草案

新增表或扩展 `terminals`：

```sql
ALTER TABLE terminals
  ADD COLUMN bootstrap_token_hash text,
  ADD COLUMN bootstrap_token_jti text,
  ADD COLUMN bootstrap_token_expires_at timestamptz,
  ADD COLUMN bootstrap_token_last_used_at timestamptz,
  ADD COLUMN bootstrap_token_revoked_at timestamptz;
```

如果希望保留历史与多 token 轮换记录，建议新增表：

```sql
CREATE TABLE terminal_bootstrap_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id uuid NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  token_jti text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by_member_id uuid,
  created_by_terminal_id uuid,
  UNIQUE (terminal_id, token_hash)
);
```

推荐新增表，便于审计和轮换。

## 八、迁移步骤

### Step 1：观测拆分

状态：2026-04-17 已完成 PR-3A 本地实现与回归验证。

1. `/observabilityz` 增加 `auth_session_bootstrap.requests_total`、`status_counts`、`auth_mode_counts`、`legacy_requests_total`、`legacy_context_field_counts`。
2. `/observabilityz.legacy_context.field_counts` 改为只统计 runtime 路径；全量旧字段保留在 `legacy_context.all_field_counts`，用于排查但不作为 runtime 下线阈值。
3. HTTP runtime legacy accepted/rejected 指标只统计非 bootstrap 路径：`legacy_context.runtime_accepted_requests_total`、`legacy_context.runtime_rejected_requests_total`。
4. `http_request` 日志增加 `observability_scope`，当前取值为 `runtime` 或 `auth_session_bootstrap`。
5. PR-4 后旧 `/api/v1/auth/session?home_id=&terminal_id=` 引导成功路径已删除，不再输出 `auth_session_bootstrap_legacy` 事件。

### Step 2：新增 bootstrap token 签发与兑换

状态：2026-04-18 已完成 PR-3B 本地实现与回归验证。

1. 新增 bootstrap token resolver。
2. 新增 `POST /api/v1/auth/session/bootstrap`。
3. 新增终端 bootstrap token 创建/重置接口。
4. 增加单元测试和 OpenAPI 契约测试。
5. 新增 `terminal_bootstrap_tokens` 表，保存 token hash、jti、过期时间、撤销时间、最近使用时间、创建人和创建终端。
6. 创建或重置 token 时自动撤销同 terminal 的旧有效 token。
7. 兑换接口只接受 `Authorization: Bootstrap <bootstrap_token>`，成功后签发 `scope=["api","ws"]` 的 Bearer access token。

本地验证结果（2026-04-18）：

1. `python -m pytest tests`：`82 passed`
2. `npm run build`：通过
3. `docker compose up -d --build backend frontend`：通过，Alembic 已执行 `20260418_0002_terminal_bootstrap_tokens`
4. `POST /api/v1/terminals/{terminal_id}/bootstrap-token`：Bearer + active PIN session 后返回 `token_type=Bootstrap`、`scope=["bootstrap:session"]`
5. `POST /api/v1/auth/session/bootstrap`：Bootstrap token 可兑换 Bearer access token，返回 `scope=["api","ws"]`
6. 二次创建/重置后旧 bootstrap token 兑换返回 `401`，新 bootstrap token 兑换成功
7. `/observabilityz.auth_session_bootstrap.auth_mode_counts.bootstrap_token` 可观测新路径命中，`legacy_context.runtime_accepted_requests_total` 保持为 0
8. `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5173'; npm run test:e2e`：`11 passed`

### Step 3：前端切换

状态：2026-04-18 已完成 PR-3C 本地实现与回归验证。

1. 前端优先读取本地 bootstrap token。
2. 支持从 `localStorage["smart_home.bootstrap_token"]` 或 `VITE_BOOTSTRAP_TOKEN` 读取 bootstrap token。
3. 调用 `/api/v1/auth/session/bootstrap` 获取 Bearer access token。
4. 默认不再回退旧 `/api/v1/auth/session?home_id=&terminal_id=`；PR-4 后前端回退环境变量已删除。
5. E2E 已改为预置 bootstrap token 后启动页面，不再把旧 query 引导当作主路径。
6. Bearer access token 仍只保存在内存或受控存储中，按现有策略使用。

### Step 4：旧入口降级

状态：2026-04-18 已完成 PR-3C 本地实现与回归验证。

1. `/api/v1/auth/session?home_id=&terminal_id=` 默认关闭。
2. PR-4 后不再支持通过环境变量临时打开。
3. 本地容器验证中，旧 query 引导返回 `401`。
4. 连续长窗口观察旧入口为 0 后删除旧 query 参数。

本地验证结果（2026-04-18，PR-3C）：

1. `python -m pytest tests`：`83 passed`
2. `npm run build`：通过
3. `python -m py_compile scripts/preprod_http_runtime_soak.py`：通过
4. `docker compose up -d --build backend frontend`：通过，PR-4 后不再注入 legacy bootstrap 回滚开关
5. `GET /api/v1/auth/session?home_id=&terminal_id=`：返回 `401`
6. `POST /api/v1/auth/session/bootstrap`：Bootstrap token 兑换 Bearer 成功，返回 `scope=["api","ws"]`
7. `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:5173'; npm run test:e2e`：`11 passed`
8. `/observabilityz` 快照：`auth_session_bootstrap.auth_mode_counts.bootstrap_token=19`、`auth_session_bootstrap.legacy_requests_total=0`、`legacy_context.runtime_accepted_requests_total=0`、`websocket.auth_mode_counts.bearer=12`、`websocket.connections_total=12`

### Step 5：终端激活入口

状态：2026-04-18 已完成 PR-3D 本地实现与回归验证。

1. 前端在没有 `localStorage["smart_home.bootstrap_token"]` 且未配置 `VITE_BOOTSTRAP_TOKEN` 时，不再直接进入错误态，而是展示终端激活页。
2. 激活页支持粘贴 bootstrap token，并调用 `POST /api/v1/auth/session/bootstrap` 兑换 Bearer access token。
3. 兑换成功后，前端将 bootstrap token 写入 `localStorage["smart_home.bootstrap_token"]`，随后进入现有中控 shell。
4. 兑换失败或本地旧 token 失效时，前端清理旧 token，并停留在激活页等待重新输入。
5. E2E 新增无 token 启动路径，覆盖“激活页 -> 输入 token -> 进入 shell -> token 持久化”。

本地验证结果（2026-04-18，PR-3D）：

1. `npm run build`：通过
2. `docker compose up -d --build frontend`：通过，当前默认端口为 `frontend=25173`、`backend=28000`
3. `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:25173'; npx playwright test e2e/m1-smoke.spec.ts -g "terminal activation stores bootstrap token and enters shell"`：`1 passed`
4. `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:25173'; npm run test:e2e`：`12 passed`

## 九、验收标准

1. HTTP 运行时业务接口 `auth_mode=legacy_context` 接受量为 0。
2. `/api/v1/auth/session/bootstrap` 可签发 `scope=["api","ws"]` 的 access token。
3. 旧 `/api/v1/auth/session?home_id=&terminal_id=` 关闭后返回 `401` 或 `410`。
4. M1/M2 E2E 全绿。
5. `/observabilityz` 能区分：
   - runtime bearer
   - runtime rejected old context
   - auth session legacy bootstrap
   - auth session bootstrap token
6. `/observabilityz.legacy_context.runtime_accepted_requests_total` 长窗口保持为 0，且旧引导命中只进入 `auth_session_bootstrap.legacy_requests_total`。
7. 日志不包含 bootstrap token、access token、PIN、HA token 明文。

## 十、PR-4 最终兼容清理结论

状态：2026-04-18 已完成本地实现与回归验证。

1. 旧 `GET /api/v1/auth/session?home_id=&terminal_id=` legacy fallback 已下线；无 Bearer 的旧 query 请求返回 `401`。
2. 后端已删除 `AUTH_SESSION_LEGACY_BOOTSTRAP_ENABLED` 设置项，Compose 不再注入该环境变量。
3. 前端已删除 `VITE_AUTH_SESSION_LEGACY_BOOTSTRAP_ENABLED` 与 `fetchLegacyCurrentSession` 回退逻辑；没有 bootstrap token 时只进入终端激活页。
4. `httpClient` 已删除 `includeLegacyContext` 自动拼接 `home_id / terminal_id` 的能力。
5. soak 脚本已删除 `SOAK_ALLOW_LEGACY_BOOTSTRAP`，只接受 `SOAK_BOOTSTRAP_TOKEN`。
6. 后端不再输出 `auth_session_bootstrap_legacy` 结构化日志事件；`/observabilityz.auth_session_bootstrap.legacy_requests_total` 仅作为历史回归观察字段保留，目标值恒为 `0`。

本地验证结果：

1. `python -m pytest tests`：`83 passed`
2. `python -m py_compile scripts/preprod_http_runtime_soak.py`：通过
3. `npm run build`：通过
4. `docker compose up -d --build backend frontend`：通过
5. `GET /api/v1/auth/session?home_id=&terminal_id=`：返回 `401`
6. `POST /api/v1/auth/session/bootstrap`：Bootstrap token 兑换 Bearer 成功，返回 `scope=["api","ws"]`
7. 容器环境变量检查：`AUTH_SESSION_LEGACY_BOOTSTRAP_ENABLED` 不存在
8. `$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:25173'; npm run test:e2e`：`12 passed`

## 十一、下一步建议

1. 运行真实 HA/预发长窗口，确认 `auth_session_bootstrap.legacy_requests_total=0`、`legacy_context.runtime_accepted_requests_total=0`、WS bearer 占比 100%。
2. 将管理端创建/重置 bootstrap token 的入口产品化，补齐复制、展示一次、重置审计与操作者提示。
3. 继续设计安装期绑定码流程，用于后续替代人工分发 bootstrap token 的场景。
