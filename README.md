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
