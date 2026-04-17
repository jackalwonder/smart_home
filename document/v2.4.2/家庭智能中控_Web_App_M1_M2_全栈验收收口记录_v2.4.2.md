# 《家庭智能中控 Web App M1/M2 全栈验收收口记录 v2.4.2》

## 一、验收信息

验收时间：2026-04-17 21:55:01 +08:00

代码基线：`442a3a1`

验收环境：

1. Docker Compose v5.1.0
2. Docker 29.2.1
3. 前端容器端口：`25173`
4. 后端容器端口：`28000`
5. PostgreSQL 容器端口：`15432`
6. Redis 容器端口：`16379`
7. Home Assistant 容器端口：`28123`

## 二、验收范围

本次收口覆盖 M1/M2 主链路，不新增产品范围。

M1 覆盖：

1. Shell 加载与管理 PIN 解锁。
2. 首页总览、设置保存、实时 `settings_updated` 同步。
3. 设备控制请求提交、幂等查询与最终结果展示。
4. WebSocket 断线重连、`last_event_id` 增量恢复与快照刷新。
5. 备份恢复跨终端实时同步。

M2 覆盖：

1. 编辑器打开可写会话。
2. 背景图上传、清除、保存、发布。
3. 热点新增、选择、拖拽、批量编辑、撤销、重做。
4. 编辑锁被接管后的只读降级与恢复。
5. 保存/发布版本冲突提示与刷新后重试。

## 三、执行命令与结果

构建并启动全栈服务：

```bash
docker compose up -d --build postgres redis backend frontend
```

结果：成功，后端容器健康检查通过。

后端测试：

```bash
python -m pytest tests
```

结果：`69 passed`

前端构建：

```bash
npm run build
```

结果：成功，TypeScript 与 Vite 构建通过。

Playwright E2E：

```bash
npm run test:e2e
```

最终结果：`11 passed`

## 四、发现的问题与修复

### 4.1 编辑器实时刷新覆盖本地未保存草稿

首次 E2E 执行时，`editor UI opens an edit session, saves draft, and publishes` 用例失败。失败点在上传背景图后点击“清除背景图”：

1. 页面已显示“背景图已更新”。
2. 随后较晚到达的 `draft_lock_acquired` 实时事件触发 editor snapshot 刷新。
3. 该刷新使用同一租约、同一草稿版本的后端旧快照覆盖了前端本地未保存草稿。
4. 背景资产 ID 被恢复为空，“清除背景图”按钮重新变为禁用。

修复方式：

1. 编辑器记录最近一次已应用的后端快照标识：`leaseId`、`draftVersion`、`baseLayoutVersion`、`lockStatus`。
2. 当新的 editor snapshot 与最近已应用快照相同，并且当前租约仍为 `GRANTED`，同时本地草稿相对发布基线已有未保存改动时，跳过本次旧快照覆盖。
3. 当草稿版本、基线布局、租约或锁状态真的变化时，仍正常应用后端快照，保证保存、发布、冲突恢复与接管流程不受影响。

涉及文件：

1. `frontend/src/pages/EditorWorkbenchWorkspace.tsx`

回归结果：

1. `npm run build` 通过。
2. 重建前端容器后，`npm run test:e2e` 全部通过。

## 五、收口结论

M1 主链路已通过全栈验收。

M2 编辑器主链路已通过全栈验收，并修复了实时事件与本地未保存编辑之间的竞态覆盖问题。

当前仍建议后续继续收口：

1. 为 `auth_mode`、旧兼容参数命中率、WS snapshot fallback 命中率补结构化日志与指标。
2. 把文档中的鉴权迁移状态更新为“Bearer 主链路已落地，旧上下文仍处兼容期”。
3. 在预发或目标部署机上复跑同一套 Docker + Playwright 验收，确认环境差异不会影响交付。
