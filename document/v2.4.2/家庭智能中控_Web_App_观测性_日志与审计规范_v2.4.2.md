# 《家庭智能中控 Web App 观测性、日志与审计规范 v2.4.2》

## 一、文档目的

本文件用于给 v2.4.2 实施阶段建立统一的日志、指标、审计与排障口径。

引用：

1. 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
2. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》
3. 《家庭智能中控 Web App 测试用例与验收清单 v2.4.1》
4. 《家庭智能中控 Web App 鉴权迁移与安全威胁模型 v2.4.2》

---

## 二、日志分层

### 2.1 应用日志

用于记录：

1. 请求进入与响应结果
2. 业务写操作结果
3. 外部依赖调用结果
4. WS 建连、重连、补偿

### 2.2 审计日志

用于记录高风险或需要追责的动作：

1. PIN 验证成功/失败
2. Save All
3. Publish
4. draft takeover / lock lost
5. 系统连接变更
6. 备份创建与恢复

### 2.3 指标

用于统计：

1. 接口成功率、错误率、时延
2. WS 在线连接数
3. outbox 积压量
4. snapshot fallback 命中率
5. 旧鉴权兼容路径命中率

当前最小落地状态（2026-04-17）：

1. 后端已新增结构化 HTTP 请求日志事件：`http_request`。
2. PR-4 后旧 HTTP bootstrap 成功路径已删除，不再输出 `auth_session_bootstrap_legacy` 事件。
3. 后端已新增结构化 WS 事件：`websocket_connection`、`websocket_resume`、`websocket_rejected`。
4. 后端已新增 `/observabilityz` 聚合快照，用于查看当前进程内的 HTTP、runtime legacy context、auth session bootstrap、WebSocket accepted/rejected 计数。
5. `http_request` 日志已增加 `observability_scope`，当前取值为 `runtime` 或 `auth_session_bootstrap`。
6. 当前指标为进程内内存快照，用于本地、CI、预发迁移观察；生产长期留存仍需后续接入 Prometheus、日志平台或 APM。

---

## 三、结构化字段要求

HTTP / 业务日志最少字段：

1. `timestamp`
2. `level`
3. `trace_id`
4. `request_path`
5. `method`
6. `home_id`
7. `terminal_id`
8. `operator_id`
9. `error_code`
10. `duration_ms`
11. `auth_mode`
12. `status_code`
13. `legacy_context_fields`
14. `observability_scope`
15. `client_ip`
16. `user_agent`

业务扩展字段：

1. 控制请求：`request_id`, `device_id`
2. 编辑锁：`lease_id`, `lock_status`
3. WS 事件：`event_id`, `event_type`, `change_domain`, `snapshot_required`
4. 版本操作：`settings_version`, `layout_version`, `backup_id`
5. 鉴权迁移：`auth_mode`, `access_token_jti`, `legacy_context_fields`, `observability_scope`

约束：

1. 不记录 PIN 明文
2. 不记录 access token 明文
3. session token、JWT 只允许记录哈希或截断值
4. 当前结构化日志只记录旧上下文字段名称，不记录 token、PIN 或认证原文

---

## 3.1 鉴权迁移指标口径

PR-3A 后，旧路径指标分为 runtime 与 auth session bootstrap 两组：

1. `legacy_context.field_counts`：只统计非 bootstrap 的 runtime HTTP 路径旧字段命中。
2. `legacy_context.all_field_counts`：统计 HTTP、WS、bootstrap 的旧字段总命中，用于排障，不作为 runtime 下线阈值。
3. `legacy_context.runtime_accepted_requests_total`：runtime 路径成功接受 legacy auth 的请求数，PR-2/PR-3 长窗口必须保持为 0。
4. `legacy_context.runtime_rejected_requests_total`：runtime 路径拒绝 legacy auth 的请求数，用于确认负向探针进入观测。
5. `auth_session_bootstrap.requests_total`：auth session bootstrap 请求总数，包含 `GET /api/v1/auth/session` 与 `POST /api/v1/auth/session/bootstrap`。
6. `auth_session_bootstrap.legacy_requests_total`：旧 `home_id / terminal_id` bootstrap 被接受的次数，后续 PR-3B/PR-3C 迁移目标是降为 0。
7. `auth_session_bootstrap.legacy_context_field_counts`：旧 bootstrap 中出现的 query/header/cookie 字段名称计数。
8. `auth_session_bootstrap.auth_mode_counts.bootstrap_token`：新 Bootstrap token 兑换路径命中次数。
9. `http_request.observability_scope`：用于日志侧区分 `runtime` 与 `auth_session_bootstrap`。

---

## 四、关键链路观测要求

### 4.1 Save All

必须记录：

1. 输入版本
2. 输出 `settings_version`
3. 操作终端
4. 是否写入 `settings_updated` outbox 事件

依据：

1. 《家庭智能中控 Web App 接口清单 v2.4》设置保存接口条目
2. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》`settings_updated`

### 4.2 Publish

必须记录：

1. `lease_id`
2. 输入 `draft_version`
3. 输出 `layout_version`
4. 是否写入 `publish_succeeded` outbox 事件

依据：

1. 《家庭智能中控 Web App 接口清单 v2.4》Publish 接口条目
2. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》`publish_succeeded`

### 4.3 备份恢复

必须记录：

1. `backup_id`
2. 恢复后的 `settings_version`
3. 恢复后的 `layout_version`
4. 是否写入 `backup_restore_completed`

依据：

1. 《家庭智能中控 Web App 接口清单 v2.4》备份恢复接口条目
2. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》`backup_restore_completed`

### 4.4 WebSocket 重连补偿

必须记录：

1. `last_event_id`
2. 是否命中增量回放
3. 是否触发 `snapshot_required`
4. 当前连接 `terminal_id`

依据：

1. 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》“七、last_event_id 重连补偿规则”

---

## 五、审计事件清单

以下动作必须落审计日志：

1. PIN 验证成功
2. PIN 验证失败与锁定
3. Save All 成功/失败
4. Publish 成功/失败
5. 编辑锁获取、失锁、接管
6. 系统连接保存/刷新
7. 电量账号绑定/刷新
8. 默认媒体绑定/解绑
9. 备份创建/恢复

审计字段最少包括：

1. `occurred_at`
2. `action_type`
3. `home_id`
4. `terminal_id`
5. `operator_id`
6. `request_id`
7. `result`
8. `error_code`

---

## 六、排障建议

排障顺序：

1. 先查应用日志是否已有 `error_code`
2. 再查审计日志是否存在对应敏感操作记录
3. 若是 WS 问题，再查：
   - 建连日志
   - outbox 插入日志
   - replay/fallback 日志

---

## 七、质量要求

1. 生产环境日志必须结构化。
2. 所有高风险操作必须能在审计日志中按 `home_id / terminal_id / operator_id` 追踪。
3. 鉴权迁移期间必须能区分 Bearer 与 legacy 模式。
4. 关键事件必须能串联 HTTP 写入、DB 提交、outbox 插入、WS 分发四个阶段。

---

## 八、结论

v2.4.2 的观测重点不在通用监控，而在“身份迁移是否安全”“outbox 是否可靠”“Save All / Publish / 恢复是否可追责”。
