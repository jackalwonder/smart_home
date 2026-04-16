# 《家庭智能中控 Web App 前端架构与接入方案 v2.4.2》

## 一、文档目的

本文件用于把《家庭智能中控 Web App 前后端技术栈选型 v2.4》的前端冻结结论细化到可实施层，但不新增产品范围。

引用基线：

1. 《家庭智能中控 Web App 前后端技术栈选型 v2.4》“二、冻结结论”“五、前后端目录约定”
2. 《家庭智能中控 Web App 接口冻结联调表 v2.4.1》
3. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》
4. 《家庭智能中控 Web App OpenAPI 与前端类型生成规范 v2.4.2》

---

## 二、当前代码库事实

当前前端代码库已体现以下实施事实：

1. React 19.1  
依据：`frontend/package.json`
2. React Router DOM 7.6  
依据：`frontend/package.json`、`frontend/src/router.tsx`
3. Vite 6.3 + TypeScript 5.8  
依据：`frontend/package.json`
4. Store 采用自定义外部状态容器，基于 `useSyncExternalStore`  
依据：`frontend/src/store/appStore.ts`
5. HTTP 客户端为手写 `fetch` 封装  
依据：`frontend/src/api/httpClient.ts`
6. WebSocket 客户端为手写实现  
依据：`frontend/src/ws/wsClient.ts`

结论：

1. 当前代码与《家庭智能中控 Web App 前后端技术栈选型 v2.4》“React + TypeScript + Vite”大方向一致。
2. 但文档尚未冻结 Router、Store、API client、WS client 的接入责任边界。

---

## 三、前端分层约定

### 3.1 路由层

职责：

1. 路由定义页面边界与懒加载边界。
2. 不承载业务聚合逻辑。

当前落点：

1. `frontend/src/router.tsx`

冻结约束：

1. 首页、设置页、编辑态继续作为一级路由。
2. 路由守卫只做会话/权限前置，不做业务写入。

### 3.2 Store 层

职责：

1. 管理页面共享状态。
2. 管理 HTTP 初始加载状态与 WS 增量事件状态。
3. 管理重连、去重、补偿触发标记。

当前落点：

1. `frontend/src/store/appStore.ts`

冻结约束：

1. 不把接口调用逻辑写进纯展示组件。
2. Store 必须显式区分：
   - 初始 HTTP 数据
   - WS 增量事件
   - 补偿拉取结果

### 3.3 API Client 层

职责：

1. 统一封装 HTTP 请求、响应体、错误体。
2. 统一处理鉴权头、幂等 header、请求超时、错误映射。

当前落点：

1. `frontend/src/api/httpClient.ts`

冻结约束：

1. 不允许页面直接调用 `fetch`。
2. OpenAPI 生成类型与手写适配层在本层汇合。

### 3.4 WebSocket Client 层

职责：

1. 建连、断线重连、`last_event_id` 管理。
2. 事件去重、乱序检测、补偿触发。
3. 向 Store 分发标准化事件。

当前落点：

1. `frontend/src/ws/wsClient.ts`

冻结约束：

1. 连接身份以 Bearer token 为准，`home_id / terminal_id` 只保留兼容诊断位。
2. 重连时优先携带 `last_event_id`，不直接把“断线后全量补拉”当主流程。

---

## 四、页面与数据接入规则

引用：

1. 《家庭智能中控 Web App 接口冻结联调表 v2.4.1》
2. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》

### 4.1 HTTP 初始拉取

以下信息以 HTTP 初始拉取为主：

1. 会话态：`GET /api/v1/auth/session`
2. 首页总览：`GET /api/v1/home/overview`
3. 设置快照：`GET /api/v1/settings`
4. 编辑草稿：`GET /api/v1/editor/draft`
5. 电量快照：`GET /api/v1/energy`
6. 默认媒体：`GET /api/v1/media/default`
7. 备份列表：`GET /api/v1/system/backups`

### 4.2 WS 增量更新

以下变化以 WS 增量为主：

1. `device_state_changed`
2. `summary_updated`
3. `settings_updated`
4. `publish_succeeded`
5. `draft_lock_lost`
6. `draft_taken_over`
7. `energy_refresh_completed`
8. `media_state_changed`
9. `backup_restore_completed`
10. `ha_sync_degraded`
11. `ha_sync_recovered`

### 4.3 快照补偿

以下场景必须触发 HTTP 快照补偿：

1. 收到 `snapshot_required = true`
2. `last_event_id` 增量补偿失败
3. 当前连接内出现 `sequence` 缺口
4. 前端事件去重后发现关键状态丢失

---

## 五、鉴权接入口径

目标口径引用：

1. 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》“七、HTTP 鉴权规则”“八、WebSocket 鉴权规则”
2. 《家庭智能中控 Web App 鉴权迁移与安全威胁模型 v2.4.2》

实施口径：

1. 前端接入层必须支持目标架构与兼容架构并存的迁移阶段。
2. 目标态：
   - HTTP 使用 `Authorization: Bearer <access_token>`
   - WS 使用 Bearer token 语义建连
3. 兼容态：
   - 保留旧 `home_id / terminal_id / pin_session_token` 的接入桥接
   - 但桥接逻辑不得继续向页面层暴露

---

## 六、前端目录建议

建议维持以下目录边界：

```text
frontend/src/
  api/
    client/
    generated/
    adapters/
  auth/
  config/
  pages/
  shell/
  store/
  ws/
  components/
```

约束：

1. `generated/` 只放自动生成类型与客户端。
2. `adapters/` 负责把接口模型转为页面模型。
3. `store/` 不直接依赖页面组件。

---

## 七、完成标准

1. 页面层不再直接拼接接口路径、query、header。
2. 所有 HTTP 模型统一来自 OpenAPI 生成结果或其适配层。
3. WS 建连、重连、补偿、去重规则统一收敛在 `ws/` 与 `store/`。
4. 与《家庭智能中控 Web App 接口冻结联调表 v2.4.1》逐条映射可追溯。

---

## 八、结论

前端本轮不需要换技术栈，需要的是把现有 React 19 + Router 7 + 自定义 Store + 手写 client 的事实沉淀成统一接入规范，并为后续 Bearer 鉴权迁移留出稳定边界。
