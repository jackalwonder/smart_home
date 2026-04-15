# Frontend Scaffold

该目录是按冻结文档 `v2.4` 起的首版前端骨架，当前目标是先固定：

- React + TypeScript + Vite 工程结构
- 首页 / 设置中心 / 编辑态 三大页面壳
- `API / store / ws / components / pages` 分层
- 冻结契约相关的启动、会话、实时同步承接点

## 当前假设

- 包管理器：`npm`
- 路由：`react-router-dom`
- UI：原生 CSS 变量，不预设第三方组件库
- 状态：先用轻量自研 store，后续可替换成 Zustand/Redux

## 启动

推荐先走 Docker：

```bash
docker compose up -d --build frontend
```

前端默认通过 nginx 反代到同一编排中的 `backend`：

- `/api/* -> http://backend:8000`
- `/ws -> http://backend:8000/ws`

如需本机直跑：

```bash
npm install
npm run dev
```

## 环境变量

可选：

```bash
VITE_API_BASE_URL=http://localhost:8000
```

## 下一步建议

1. 接真实接口 DTO 和领域 model。
2. 将首页浮层、设备卡片、控制链路接入冻结接口。
3. 为设置中心补本地草稿态与 Save All 提交。
4. 为编辑态补 draft、heartbeat、publish、takeover。
