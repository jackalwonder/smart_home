# 家庭智能中控 Web App

面向壁挂式 Android 平板的智能家居中控 Web 应用（SPA + PWA kiosk），集成 **Home Assistant** 作为后端家居自动化引擎。

## 核心功能

- 2.5D 平面图首页概览，设备热点控制
- 设备目录与控制（灯光、窗帘、空调、媒体设备等）
- SGCC 国家电网电费监控
- 天气展示（Open-Meteo API / HA weather entity）
- 系统设置管理，备份与恢复
- 可视化平面图编辑器（草稿 / 发布工作流）
- WebSocket 实时事件推送
- PIN 认证与终端激活（扫码 / 激活码 / 绑定码）

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Python 3.12 · FastAPI · SQLAlchemy 2.0 · Alembic · Pydantic 2.8 · Injector |
| 前端 | React 19 · TypeScript 5.8 · Vite 6.3 · React Router 7.6 |
| 数据库 | PostgreSQL 16 · Redis 7 |
| 集成 | Home Assistant · SGCC 电费 sidecar · Open-Meteo Weather |
| 基础设施 | Docker Compose · Nginx · GitHub Actions CI |

## 快速启动

### 前置条件

1. 安装 [Docker](https://www.docker.com/)
2. 配置 `.env` 文件（从 `.env.example` 复制并替换安全密钥）

```bash
cp .env.example .env
# 编辑 .env，将三个 SECRET 替换为随机生成的强密钥（≥32 字符）
```

### 启动所有服务

```bash
docker compose up -d --build
```

服务启动后：
- **前端**：`http://localhost:5173`
- **后端 API**：`http://localhost:8000/api/v1/`
- **Home Assistant**：`http://localhost:8123`

### 本地开发

```bash
# 后端
cd backend
pip install -e ".[dev]"
python -m pytest tests/

# 前端
cd frontend
npm install
npm run dev
```

前端开发服务器默认监听 `http://localhost:5173`，并通过 Vite proxy 将
`/api/*` 与 `/ws` 转发到 `VITE_BACKEND_PROXY_TARGET`，默认
`http://localhost:8000`。本地开发时先启动后端，再访问前端端口；浏览器不需要
直接跨域访问后端 API。

### 配置与运行态数据

- 根目录 `.env` 保存 Compose 启动所需的端口、密钥和集成配置，必须从
  `.env.example` 复制后在本机填写，不应提交真实值。
- 本地和 CI 默认前端端口统一为 `FRONTEND_PORT=5173`。E2E 默认基址为
  `PLAYWRIGHT_BASE_URL=http://127.0.0.1:${FRONTEND_PORT}`，如需换端口应同时
  修改 `.env`、CI 环境变量和 Playwright 启动参数。
- `deploy/` 只跟踪 README 和示例模板；Home Assistant 数据库、日志、
  SGCC 缓存、二维码和真实 `.env` 都属于运行态数据，默认被 `.gitignore`
  排除。
- SGCC sidecar 如需账号密码模式，在运行机器上从
  `deploy/sgcc_electricity/.env.example` 复制出本地
  `deploy/sgcc_electricity/.env`，并使用密钥管理工具或本机权限保护该文件。
- 后端容器默认不会写入开发演示数据。只有显式设置
  `BOOTSTRAP_DEV_DATA=true`，且 `APP_ENV` 为 `local`、`dev`、`development`
  或 `test` 时才会执行开发数据脚本。
- Compose 默认启用 Redis 请求级限流（`RATE_LIMIT_ENABLED=true`）：登录、
  PIN、bootstrap、pairing、上传、文件下载有独立阈值，其他 API 走全局兜底；
  命中限流时统一返回 `429` 和 `RATE_LIMITED` 错误码。Redis 短暂不可用时限流
  fail-open，避免把缓存故障扩大成全站不可用。
- PIN 使用 Argon2id 慢哈希保存。旧版 `sha256(pin:salt)` 哈希仍可
  验证，成功验证后会自动迁移为新格式。
- Compose 已为各服务配置 `*_MEM_LIMIT` 和 `*_CPUS` 默认值。部署到不读取这些
  Compose 字段的平台时，需要在平台侧配置等效 CPU/内存限制。
- 前端 Nginx 默认发送最小 enforce `Content-Security-Policy`，允许同源
  API/WebSocket、`data:` 二维码图片和 `blob:` 运行时图片。HSTS 只应配在真实
  HTTPS/TLS 终止入口，不应放到本仓库的纯 HTTP 容器入口。

### 验证命令

```bash
# 后端
uv run --project backend --extra dev python -m ruff check backend/src backend/tests scripts/check_plaintext_secrets.py
uv run --project backend --extra dev python -m pip_audit --requirement backend/requirements.lock --strict
uv run --project backend --extra dev python -m pytest backend/tests -q
uv run --project backend --extra dev python scripts/check_plaintext_secrets.py

# Compose 配置校验需要提供三个必填 secret，生产必须使用真实随机值。
CONNECTION_ENCRYPTION_SECRET=cccccccccccccccccccccccccccccccc \
ACCESS_TOKEN_SECRET=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
BOOTSTRAP_TOKEN_SECRET=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
docker compose config --quiet

# 前端
cd frontend
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build

# E2E（默认 Compose 前端端口，和 FRONTEND_PORT 保持一致）
export FRONTEND_PORT=${FRONTEND_PORT:-5173}
export PLAYWRIGHT_BASE_URL="http://127.0.0.1:${FRONTEND_PORT}"
npm run test:e2e
```

### 镜像与依赖维护

Dockerfile 和 Compose 中的基础镜像使用 digest pin，避免 `latest`/`stable`
隐式漂移。升级镜像时应同时更新 digest、记录升级原因，并运行后端测试、
前端测试、Docker build 和 E2E。

后端 Python 依赖以 `backend/pyproject.toml` 为声明入口，`backend/uv.lock`
为解析锁文件，`backend/requirements.lock` 和 `backend/requirements-dev.lock`
为 Docker/CI 安装入口。升级依赖后需要重新生成锁文件和 requirements 导出，
再运行 `pip-audit`、后端测试、Docker build 和 E2E。

## 项目结构

```
├── backend/              # Python FastAPI 后端
│   ├── src/              #   应用源码（modules / infrastructure / repositories / shared）
│   ├── tests/            #   单元测试 + 集成测试
│   └── alembic/          #   数据库迁移
├── frontend/             # React TypeScript 前端
│   ├── src/              #   应用源码（pages / components / store / api / ws）
│   └── e2e/              #   Playwright E2E 测试
├── services/             # 微服务 sidecar（SGCC 电费）
├── deploy/               # 部署配置（HA config / SGCC env）
├── document/             # 项目文档
│   ├── v2.4.2/           #   当前开发基线（PRD / API / DDL / ER / 架构 / 测试）
│   └── review/           #   评审报告
├── docker-compose.yml    # 容器编排（frontend / backend / postgres / redis / ha / sgcc）
├── scripts/              # 工具脚本（soak testing）
└── .github/workflows/    # CI 流水线
```

## 文档

完整文档见 `document/v2.4.2/` 目录，包含：
- 产品需求文档（PRD）
- API 接口清单
- PostgreSQL DDL 与 ER 图
- 架构设计说明
- 认证方案与安全威胁模型
- 部署手册与终端现场交付指南
- 测试用例与验收清单
- Roadmap 与任务分解
