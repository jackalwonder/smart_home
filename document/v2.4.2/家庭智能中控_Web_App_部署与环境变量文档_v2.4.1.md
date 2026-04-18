# 《家庭智能中控 Web App 部署与环境变量文档 v2.4.1》

## 一、冲突扫描与推荐修订口径（先行）

### 1.1 已发现冲突

1. 历史文档中后端骨架存在 TS/Nest 风格残留描述，但 v2.4.1 已冻结为 FastAPI。
2. WebSocket 连接参数与 token claim 存在双来源描述。

### 1.2 推荐修订口径

1. 部署与运行统一按 Python/FastAPI 工程组织执行。
2. 鉴权上下文以 token claim 为准，外部参数仅兼容传输。

---

## 二、部署目标与范围

1. 覆盖本地开发部署与生产部署。
2. 覆盖 PostgreSQL、Alembic、FastAPI、React/Vite、WebSocket、Home Assistant 对接。
3. 覆盖加密密钥、JWT、PIN hash、CORS、端口配置与健康检查。

---

## 三、建议目录与组件

```text
smart_home/
  backend/
  frontend/
  document/
  docker-compose.yml
  .env
```

组件：

1. `backend`：FastAPI + SQLAlchemy 2.0 + Alembic。
2. `frontend`：React + TypeScript + Vite。
3. `postgres`：业务数据库。
4. `redis`（可选）：缓存与连接态辅助，不做真源。

---

## 四、Docker Compose 建议结构

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 20

  backend:
    build: ./backend
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "${BACKEND_PORT:-8000}:8000"
    command: >
      sh -c "alembic upgrade head &&
             uvicorn src.app.main:app --host 0.0.0.0 --port 8000"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8000/healthz"]
      interval: 10s
      timeout: 3s
      retries: 20

  frontend:
    build: ./frontend
    env_file: .env
    depends_on:
      backend:
        condition: service_healthy
    ports:
      - "${FRONTEND_PORT:-5173}:5173"
    command: ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

  redis:
    image: redis:7-alpine
    profiles: ["optional"]
    ports:
      - "${REDIS_PORT:-6379}:6379"

volumes:
  pg_data:
```

---

## 五、环境变量说明

### 5.1 数据库 / Alembic

1. `POSTGRES_HOST`
2. `POSTGRES_PORT`
3. `POSTGRES_DB`
4. `POSTGRES_USER`
5. `POSTGRES_PASSWORD`
6. `DATABASE_URL`（SQLAlchemy async URL）
7. `ALEMBIC_DATABASE_URL`（Alembic sync URL，可与上者分离）

### 5.2 FastAPI / WebSocket

1. `APP_ENV`（`local/staging/prod`）
2. `BACKEND_PORT`
3. `API_PREFIX`（默认 `/api/v1`）
4. `WS_PATH`（默认 `/ws`）
5. `LOG_LEVEL`
6. `UVICORN_WORKERS`（生产建议 >=2）

### 5.3 React / Vite

1. `FRONTEND_PORT`
2. `VITE_API_BASE_URL`
3. `VITE_WS_URL`

### 5.4 鉴权 / 加密 / PIN

1. `JWT_ISSUER`
2. `JWT_AUDIENCE`
3. `JWT_ALGORITHM`（推荐 `HS256` 或 `RS256`）
4. `JWT_SECRET_KEY`（HS 模式）
5. `JWT_PUBLIC_KEY`、`JWT_PRIVATE_KEY`（RS 模式）
6. `ACCESS_TOKEN_TTL_SECONDS`
7. `BOOTSTRAP_TOKEN_SECRET`
8. `BOOTSTRAP_TOKEN_TTL_SECONDS`
9. `BOOTSTRAP_TOKEN_LEEWAY_SECONDS`
10. `VITE_BOOTSTRAP_TOKEN`（仅本地/测试构建可用；生产建议通过受控终端存储写入）
11. `CONNECTION_SECRET_ENCRYPTION_KEY`（系统连接敏感信息加密）
12. `PIN_HASH_ALGORITHM`（推荐 `argon2id`）
13. `PIN_HASH_PEPPER`
14. `PIN_MAX_RETRY`
15. `PIN_LOCK_MINUTES`
16. `PIN_SESSION_TTL_SECONDS`

### 5.5 Home Assistant / 能力开关 / CORS

1. `HA_BASE_URL`
2. `HA_TOKEN`
3. `HA_TIMEOUT_SECONDS`
4. `FEATURE_ENERGY_ENABLED`
5. `FEATURE_EDITOR_ENABLED`
6. `CORS_ALLOW_ORIGINS`
7. `CORS_ALLOW_CREDENTIALS`
8. `CORS_ALLOW_HEADERS`

---

## 六、`.env.example`

```env
# ===== App =====
APP_ENV=local
LOG_LEVEL=INFO
API_PREFIX=/api/v1
WS_PATH=/ws
BACKEND_PORT=8000
FRONTEND_PORT=5173
UVICORN_WORKERS=1

# ===== PostgreSQL =====
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=smart_home
POSTGRES_USER=smart_home
POSTGRES_PASSWORD=change_me
DATABASE_URL=postgresql+asyncpg://smart_home:change_me@postgres:5432/smart_home
ALEMBIC_DATABASE_URL=postgresql+psycopg://smart_home:change_me@postgres:5432/smart_home

# ===== JWT =====
JWT_ISSUER=smart-home-backend
JWT_AUDIENCE=smart-home-web-app
JWT_ALGORITHM=HS256
JWT_SECRET_KEY=replace_with_very_long_random_secret
ACCESS_TOKEN_TTL_SECONDS=86400
BOOTSTRAP_TOKEN_SECRET=replace_with_different_very_long_random_secret
BOOTSTRAP_TOKEN_TTL_SECONDS=2592000
BOOTSTRAP_TOKEN_LEEWAY_SECONDS=0
VITE_BOOTSTRAP_TOKEN=

# ===== Encryption / PIN =====
CONNECTION_SECRET_ENCRYPTION_KEY=replace_with_32_byte_base64_key
PIN_HASH_ALGORITHM=argon2id
PIN_HASH_PEPPER=replace_with_random_pepper
PIN_MAX_RETRY=5
PIN_LOCK_MINUTES=15
PIN_SESSION_TTL_SECONDS=900

# ===== CORS =====
CORS_ALLOW_ORIGINS=http://localhost:5173
CORS_ALLOW_CREDENTIALS=true
CORS_ALLOW_HEADERS=Authorization,Content-Type,X-Request-ID

# ===== Frontend =====
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_WS_URL=ws://localhost:8000/ws

# ===== Home Assistant =====
HA_BASE_URL=http://home-assistant.local:8123
HA_TOKEN=replace_with_ha_token
HA_TIMEOUT_SECONDS=5

# ===== Optional Redis =====
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_ENABLED=false

# ===== Feature Flags =====
FEATURE_ENERGY_ENABLED=true
FEATURE_EDITOR_ENABLED=true
```

---

## 七、本地开发启动顺序

1. 启动 PostgreSQL（与可选 Redis）。
2. 配置 `.env` 并检查 `DATABASE_URL`。
3. 执行 Alembic：`alembic upgrade head`。
4. 启动 FastAPI：`uvicorn src.app.main:app --reload --port 8000`。
5. 启动前端：`npm run dev -- --port 5173`。
6. 打开应用并验证 `/healthz` 与 `/api/v1/auth/session`。

---

## 八、生产部署顺序

1. 准备密钥与环境变量（JWT、加密 key、PIN pepper）。
2. 启动数据库并完成备份策略配置。
3. 发布后端镜像并先执行 Alembic migration。
4. 后端健康检查通过后再放量流量。
5. 部署前端并配置 `VITE_API_BASE_URL/VITE_WS_URL`。
6. 验证跨终端 WS 事件、Save All、Publish、备份恢复闭环。

---

## 九、健康检查与运行验证

### 9.1 健康检查端点

1. 后端：`GET /healthz`（进程存活）
2. 后端：`GET /readyz`（DB 连接、迁移版本、关键依赖）
3. 前端：静态资源与首页加载

### 9.2 关键功能验活

1. `GET /api/v1/auth/session`
2. `GET /api/v1/home/overview`
3. `POST /api/v1/device-controls`（可用测试设备）
4. WebSocket 建连与事件接收
5. 新终端首次打开时，如未配置 `VITE_BOOTSTRAP_TOKEN` 且本地没有 `smart_home.bootstrap_token`，应进入终端激活页；粘贴管理端签发的 bootstrap token、激活链接或激活码后，应成功进入中控 shell。
6. 管理端创建或重置 bootstrap token 后，应可复制：
   - bootstrap token 原文
   - 激活链接
   - 激活码
   - 并展示可扫码的激活二维码
7. 终端通过激活链接进入后，地址栏中的 `bootstrap_token` 参数应被自动清除。

### 9.3 终端交付与恢复流程

1. 新终端上线
   - 在管理端“设置 -> 系统 -> Bootstrap token”选择目标终端并创建 token。
   - 优先使用激活二维码或激活链接完成交付；无法扫码时改用激活码或 token 原文。
   - 终端激活成功后，应在本地写入 `smart_home.bootstrap_token`，后续刷新页面无需再次输入。
2. 终端重装
   - 在管理端对同一 terminal 执行“重置 bootstrap token”。
   - 旧 token、旧激活链接、旧激活码应立即失效。
   - 将新的二维码 / 激活链接 / 激活码交付给重装后的终端。
3. 现场换机
   - 先完成 replacement terminal 的建档或预注册，再为新的 terminal_id 签发 bootstrap token。
   - 旧 terminal 不再使用时，应重置或撤销其 bootstrap token，避免旧设备继续换取 Bearer access token。
4. 运维脚本
   - 可使用 `backend/scripts/issue_bootstrap_token.py` 正式签发终端 token。
   - 示例：

```powershell
docker compose exec -T backend python scripts/issue_bootstrap_token.py `
  --home-id 11111111-1111-1111-1111-111111111111 `
  --terminal-id 22222222-2222-2222-2222-222222222222 `
  --created-by-terminal-id 22222222-2222-2222-2222-222222222222 `
  --frontend-url http://127.0.0.1:25173
```

   - 脚本输出包括：
     - `bootstrap_token=...`
     - `activation_code=smart-home-activate:...`
     - `activation_link=http://.../?bootstrap_token=...`

---

## 十、常见故障排查

1. 症状：`alembic upgrade head` 失败  
   - 排查：`ALEMBIC_DATABASE_URL` 是否为 sync 驱动；迁移版本是否冲突。
2. 症状：控制请求大量 `HA_UNAVAILABLE`  
   - 排查：`HA_BASE_URL/HA_TOKEN`、网络连通、超时配置。
3. 症状：WS 频繁断开  
   - 排查：token 过期时间、代理超时、`VITE_WS_URL` 是否正确。
4. 症状：PIN 一直 `PIN_LOCKED`  
   - 排查：`PIN_MAX_RETRY/PIN_LOCK_MINUTES` 配置、服务端时钟漂移。
5. 症状：Save All/Publish 成功但其他终端不同步  
   - 排查：`ws_event_outbox` 是否落库、dispatcher 是否运行、事件是否被去重误杀。
6. 症状：跨域失败  
   - 排查：`CORS_ALLOW_ORIGINS`、`Authorization` 头是否在白名单。
7. 症状：激活页提示“激活信息已过期”
   - 排查：管理端重新创建或重置 bootstrap token，并重新交付二维码 / 激活链接 / 激活码。
8. 症状：激活页提示“激活信息无效”
   - 排查：确认激活码或链接是否复制完整、是否已被重置、是否属于当前 terminal。
9. 症状：终端打开激活链接后仍停留在激活页
   - 排查：确认 backend 可达、`POST /api/v1/auth/session/bootstrap` 返回 `200`、浏览器是否拦截了地址栏跳转参数。

---

## 十一、禁止事项

1. 在生产环境复用开发密钥或默认示例密钥。
2. 跳过 Alembic 迁移直接发布后端。
3. 关闭 `ws_event_outbox` 直接“现发”事件。
4. 用 Redis 替代数据库中的版本真源、锁真源、幂等真源。
