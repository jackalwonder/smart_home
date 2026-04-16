# 《家庭智能中控 Web App OpenAPI 与前端类型生成规范 v2.4.2》

## 一、文档目的

本文件用于把《家庭智能中控 Web App 接口清单 v2.4》与当前 FastAPI 实现连接到统一的前端类型生成流程。

引用：

1. 《家庭智能中控 Web App 接口清单 v2.4》
2. 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
3. 《家庭智能中控 Web App 前端架构与接入方案 v2.4.2》

---

## 二、单一真源

统一规则：

1. HTTP 接口契约的单一真源是 FastAPI 导出的 OpenAPI 文档。
2. schema 的字段口径必须与《家庭智能中控 Web App 接口清单 v2.4》一致。
3. 错误体与统一响应体必须与《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》一致。

不在 OpenAPI 内表达的内容：

1. WebSocket 事件契约  
依据：《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》
2. outbox 补偿与重放语义  
依据：《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》

---

## 三、后端建模规则

### 3.1 Pydantic Schema 规则

1. 所有请求体、响应体使用 Pydantic v2 显式建模。
2. 不允许返回未声明字段的裸 `dict` 作为正式契约。
3. 时间字段统一使用 ISO 8601 字符串。
4. 枚举字段必须声明可选值，不允许仅在文档里口头说明。

### 3.2 FastAPI 路由规则

1. 每个接口必须有稳定 `operation_id`。
2. 读写接口分开定义，不复用同一个 schema 表达不同语义。
3. 幂等写接口必须把 `request_id`、`lease_id` 等关键字段写入 schema。

---

## 四、前端类型生成规则

### 4.1 生成物范围

前端必须生成以下内容：

1. 接口请求体类型
2. 接口响应体类型
3. 错误体类型
4. 路径参数与 query 参数类型

WS 事件类型处理：

1. 不走 OpenAPI 自动生成。
2. 由《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》手写生成或半自动生成类型定义。

### 4.2 命名规则

1. 线上的 wire schema 保持接口文档的 snake_case。
2. 页面内部若需要 camelCase，必须经过 adapter 显式映射。
3. 不允许在页面组件中一边消费 snake_case、一边消费 camelCase。

### 4.3 生成目录

建议目录：

```text
frontend/src/api/
  generated/
  adapters/
  client/
```

约束：

1. `generated/` 不手改。
2. `adapters/` 负责 UI 模型适配。
3. `client/` 负责请求注入与错误处理。

---

## 五、契约对齐规则

### 5.1 与文档对齐

1. 若 OpenAPI 与《家庭智能中控 Web App 接口清单 v2.4》冲突，先修后端 schema 或文档，禁止前端私自兼容。
2. 若 OpenAPI 与《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》冲突，统一以响应体规范收口。

### 5.2 与代码对齐

1. FastAPI schema 变更后，必须同步更新前端生成类型。
2. 前端生成类型变更后，CI 必须检查是否存在未提交生成物。

---

## 六、推荐流水线

建议流程：

1. 后端启动或导出 `openapi.json`
2. 生成前端 TypeScript 类型
3. 运行前端 `tsc --noEmit`
4. 运行契约测试，验证关键接口

质量门禁关联：

1. 《家庭智能中控 Web App CI/CD 与质量门禁规范 v2.4.2》

---

## 七、冻结边界

本文件不改变以下业务口径：

1. Save All / Publish 分离
2. `request_id` 幂等
3. `lease + heartbeat` 编辑锁
4. `settings_updated / publish_succeeded / backup_restore_completed` 事件语义

依据：

1. 《家庭智能中控 Web App 接口清单 v2.4》
2. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》

---

## 八、结论

OpenAPI 在 v2.4.2 的职责不是“生成文档”，而是把 FastAPI 实现、冻结接口清单、前端类型系统绑成一个可持续校验的单一契约链路。
