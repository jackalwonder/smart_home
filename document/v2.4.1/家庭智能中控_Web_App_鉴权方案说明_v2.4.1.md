# 《家庭智能中控 Web App 鉴权方案说明 v2.4.1》

## 一、文档信息

- 文档名称：家庭智能中控 Web App 鉴权方案说明 v2.4.1
- 文档类型：工程实施配套文档 / 鉴权与会话设计
- 适用对象：后端、前端、测试
- 编制日期：2026-04-16
- 版本状态：已冻结（实施版）
- 关联文档：
  - 《家庭智能中控 Web App 接口清单 v2.4》
  - 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
  - 《家庭智能中控 Web App 数据库模型初稿 v2.4》
  - 《家庭智能中控 Web App PostgreSQL 首版 DDL v2.4》

---

## 二、结论（v2.4.1）

1. HTTP 接口统一采用 `Authorization: Bearer <access_token>`。
2. WebSocket `/ws` 连接统一采用同一套 Bearer token 语义。
3. PIN 会话不是替代 access token 的登录态，而是“高风险操作附加校验态”。

---

## 三、令牌类型与作用

### 3.1 Access Token（必需）

用途：

1. 识别家庭与终端身份（`home_id`、`terminal_id`）。
2. 作为 HTTP 与 WebSocket 的统一鉴权凭据。

### 3.2 PIN Session（附加）

用途：

1. 控制高风险操作授权（编辑会话、发布、恢复备份、系统连接变更等）。
2. 与 `home_id + terminal_id` 强绑定，不跨终端复用。

说明：

1. PIN Session 状态真源在数据库 `pin_sessions`。
2. Access token 校验通过后，再按接口策略判断是否要求有效 PIN Session。

---

## 四、Token Payload（Access Token）

建议 JWT payload：

```json
{
  "iss": "smart-home-backend",
  "aud": "smart-home-web-app",
  "sub": "member_or_home_account_id",
  "home_id": "home_001",
  "terminal_id": "terminal_wall_01",
  "role": "HOME_OWNER",
  "scope": ["api", "ws"],
  "token_use": "access",
  "jti": "uuid",
  "iat": 1760000000,
  "exp": 1760043200
}
```

字段规则：

1. `home_id`、`terminal_id` 为必填，作为后端所有权限判断主键。
2. `scope` 至少包含 `api` 与 `ws`。
3. `token_use` 固定为 `access`，避免与其他令牌混用。

---

## 五、过期与会话时长

### 5.1 Access Token

1. 默认有效期：`24h`（可配置）。
2. 服务端按 `exp` 严格校验，不接受过期 token。
3. WebSocket 建连后若 token 到期，服务端主动断开连接并要求重连鉴权。

### 5.2 PIN Session

1. TTL 继续沿用 `home_auth_configs.pin_session_ttl_seconds`。
2. PIN Session 到期不影响基础读取接口，但会使受保护接口返回 `PIN_REQUIRED`。
3. `pin_sessions` 仍按 `(home_id, terminal_id, is_active)` 口径管理，过期需失活。

---

## 六、终端绑定规则

1. Access token 中的 `terminal_id` 与请求上下文中的终端标识必须一致。
2. 任何跨终端重放（token 与请求终端不一致）都返回 `UNAUTHORIZED`。
3. PIN Session 只对同一 `home_id + terminal_id` 生效，不允许转移到其他终端。

---

## 七、HTTP 鉴权规则

### 7.1 请求格式

```http
Authorization: Bearer <access_token>
```

### 7.2 校验顺序

1. 校验 Bearer token 签名、`iss/aud/exp`。
2. 解析 `home_id`、`terminal_id` 注入请求上下文。
3. 对 PIN 保护接口附加校验 active PIN Session。

### 7.3 失败语义

1. Token 缺失/无效/过期：`UNAUTHORIZED`。
2. Token 合法但缺少 PIN 会话：`PIN_REQUIRED`。
3. PIN 重试超限：`PIN_LOCKED`。

---

## 八、WebSocket 鉴权规则

### 8.1 传递方式

优先：

1. `Authorization: Bearer <access_token>`（支持自定义 header 的终端）。

兼容：

1. `Sec-WebSocket-Protocol: bearer, <access_token>` 或查询参数 `access_token` / `token`（受限终端）。
2. `home_id`、`terminal_id` 若出现在连接参数中，仅用于兼容传输或日志定位。

要求：

1. 无论传输介质如何，语义均视为 Bearer access token。
2. 后端统一走同一套 token 验签与 claim 校验逻辑。
3. `home_id`、`terminal_id` 的权威来源始终为 access token claim；连接参数若存在，必须与 claim 一致。

### 8.2 建连校验

1. token 通过鉴权后建立连接并绑定 `home_id + terminal_id`。
2. token 未通过鉴权，拒绝建连。
3. token 过期或被撤销时，主动断开连接。
4. 连接参数中的 `home_id` / `terminal_id` 与 token claim 不一致时，拒绝建连并返回 `UNAUTHORIZED`。

---

## 九、与 PIN Session 的关系（关键）

1. Access token 解决“你是谁（家庭/终端）”。
2. PIN Session 解决“你现在是否被授权执行敏感操作”。
3. PIN 通过后写 `pin_sessions`；敏感接口根据 token 中 `home_id/terminal_id` 去库里查 active PIN Session。
4. 不要求把 PIN 状态固化到 access token claim 中，避免频繁重签发。

---

## 十、与冻结业务规则的一致性

以下规则保持不变：

1. Save All、Publish、备份恢复流程不变。
2. `request_id` 幂等规则不变。
3. lease 锁规则不变。
4. outbox 事件规则不变。

---

## 十一、测试最小清单

1. HTTP 使用过期 token 调用：返回 `UNAUTHORIZED`。
2. WS 使用过期 token 建连：拒绝连接。
3. token 与请求 `terminal_id` 不一致：返回 `UNAUTHORIZED`。
4. PIN 保护接口无 active PIN Session：返回 `PIN_REQUIRED`。
5. PIN 保护接口有 active PIN Session：成功放行。

---

## 十二、结论

v2.4.1 鉴权方案采用“HTTP + WebSocket 统一 Bearer access token，PIN Session 作为敏感操作附加态”的双层模型，既保持现有业务口径，又消除 `token 或会话态` 的实现歧义。
