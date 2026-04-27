# 家庭智能中控 Web App — Frontend

React + TypeScript + Vite 前端，配合 FastAPI 后端和 Home Assistant，构成壁挂式平板中控的 Web 应用。

## 技术栈

- **框架**：React 19 + TypeScript 5.8
- **构建**：Vite 6.3
- **路由**：React Router DOM 7.6
- **状态管理**：自研 `useSyncExternalStore` 轻量 store
- **测试**：Vitest 4.1（单元）+ Playwright 1.59（E2E）
- **Lint**：ESLint 10 + Prettier 3.8

## 目录结构

```
src/
  main.tsx              # 应用入口
  router.tsx            # 路由定义（首页 / 设置 / 设备 / 编辑器）
  api/                  # API client + OpenAPI 生成类型
  store/                # 自研 external store
  ws/                   # WebSocket client（subprotocol bearer 认证 + 自动重连）
  pages/                # 页面组件（懒加载）
  components/           # 共享 UI 组件（auth / editor / home / settings / terminal）
  shell/                # AppShellFrame 布局壳
  auth/                 # access token / bootstrap token 管理
  view-models/          # 后端 DTO 到页面模型的映射
  editor/               # 编辑器状态 hooks 和状态机
  settings/             # 设置草稿态和运行时概览
  system/               # AppBootstrap 初始化 + realtime 集成
  utils/                # 格式化工具
  styles/               # CSS 主题和组件样式
```

## 启动

**Docker 部署（推荐）：**

```bash
docker compose up -d --build frontend
```

前端通过 nginx 反代到 backend：

- `/api/* -> http://backend:8000`
- `/ws -> http://backend:8000/ws`

**本地开发：**

```bash
npm install
npm run dev
```

## 环境变量

| 变量                                  | 说明          | 默认值                  |
| ------------------------------------- | ------------- | ----------------------- |
| `VITE_API_BASE_URL`                   | 后端 API 地址 | `http://localhost:8000` |
| `VITE_DEV_BYPASS_TERMINAL_ACTIVATION` | 跳过终端激活  | `false`                 |

## 命令

| 命令                   | 功能                               |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | 启动开发服务器                     |
| `npm run build`        | 生产构建（typecheck + vite build） |
| `npm run typecheck`    | TypeScript 类型检查                |
| `npm run lint`         | ESLint 检查                        |
| `npm run format:check` | Prettier 格式检查                  |
| `npm run test`         | Vitest 单元测试                    |
| `npm run test:e2e`     | Playwright E2E 测试                |
