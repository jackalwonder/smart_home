# 《家庭智能中控 Web App CI/CD 与质量门禁规范 v2.4.2》

## 一、文档目的

本文件用于给 v2.4.2 实施阶段定义统一的提交、验证、构建与发布门禁。

引用：

1. 《家庭智能中控 Web App 测试用例与验收清单 v2.4.1》
2. 《家庭智能中控 Web App 开发任务拆解与 Roadmap v2.4.1》
3. 《家庭智能中控 Web App OpenAPI 与前端类型生成规范 v2.4.2》
4. 《家庭智能中控 Web App 观测性、日志与审计规范 v2.4.2》

---

## 二、流水线阶段

### 2.1 后端静态检查

至少包括：

1. Python 格式化检查
2. Python lint
3. 类型检查
4. FastAPI 路由可导入检查

### 2.2 后端测试

至少包括：

1. 单元测试
2. 集成测试
3. 接口契约测试
4. Alembic migration smoke test

### 2.3 OpenAPI 与契约检查

至少包括：

1. 导出 OpenAPI
2. 校验 OpenAPI 是否可生成前端类型
3. 校验生成物是否已提交

### 2.4 前端检查

至少包括：

1. `tsc --noEmit`
2. Vite build
3. 关键路由 smoke test
4. API 类型生成对齐检查

### 2.5 端到端与回归

至少包括：

1. 首页加载
2. PIN 验证
3. Save All
4. Publish
5. 编辑锁 heartbeat / takeover
6. WS 连接与重连补偿
7. 备份恢复

---

## 三、质量门禁

以下任一失败，不得合并：

1. 后端测试失败
2. 前端类型检查失败
3. OpenAPI 与生成类型不一致
4. `request_id` 幂等或编辑锁契约测试失败
5. WS 事件外壳字段缺失
6. 关键事件语义变更但未更新文档

---

## 四、强制校验项

### 4.1 冻结业务规则校验

必须保留：

1. Save All / Publish 分离
2. `request_id` 幂等
3. `lease + heartbeat` 锁模型
4. `ws_event_outbox` 先落库再分发

依据：

1. 《家庭智能中控 Web App 接口清单 v2.4》
2. 《家庭智能中控 Web App 数据库ER图与关系说明 v2.4》
3. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》

### 4.2 鉴权迁移校验

迁移期间必须额外检查：

1. Bearer 路径可用
2. legacy 兼容路径仍可用
3. 不一致 `home_id / terminal_id` 请求被拒绝
4. WS `last_event_id` 回放成功与失败两条路径都被覆盖

依据：

1. 《家庭智能中控 Web App 鉴权迁移与安全威胁模型 v2.4.2》
2. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》

---

## 五、发布前检查单

发布前必须确认：

1. Alembic 已在目标环境演练
2. OpenAPI 已导出并通过前端生成校验
3. 关键审计日志字段在预发环境可观测
4. outbox dispatcher 与 WS replay 指标正常
5. 回滚步骤已验证

---

## 六、回滚原则

1. 鉴权迁移采用开关控制，优先支持双栈回退。
2. schema 变更必须有向后兼容窗口或明确的 migration 顺序。
3. 若 WS replay 出现系统性异常，可回退到强制 snapshot 模式，但不得移除 outbox 真源。

---

## 七、结论

v2.4.2 的 CI/CD 核心不是多复杂，而是要把“契约不漂移、生成物不失真、旧鉴权兼容可观测、冻结业务规则不被破坏”四件事强制执行。
