# 《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》

## 一、冲突扫描与推荐修订口径（先行）

### 1.1 已发现冲突

1. 既有文档对重连补偿只强调快照补拉，未明确 `last_event_id` 增量补偿流程。
2. 连接参数中 `home_id/terminal_id` 与 token claim 语义重复，可能出现不一致。

### 1.2 推荐修订口径

1. 重连流程统一为：`last_event_id` 增量补偿优先，失败后快照补偿兜底。
2. `home_id/terminal_id` 以 token claim 为准；外部参数仅用于兼容传输和日志定位。

---

## 二、文档信息

- 文档名称：家庭智能中控 Web App WebSocket 事件契约 v2.4.1
- 文档类型：实时事件契约与补偿规则
- 适用范围：`/ws` 连接、事件投递、前端订阅与补偿
- 关联基线：《接口清单 v2.4》《统一响应体与错误体规范 v2.4》《鉴权方案说明 v2.4.1》

---

## 三、连接与鉴权

1. 路径：`/ws`
2. 鉴权：统一 Bearer access token 语义。
3. token 校验失败或过期：拒绝连接或主动断开。
4. 服务端连接上下文至少包含：`home_id`、`terminal_id`、`role`、`scope`。

---

## 四、事件外壳字段定义

```json
{
  "event_id": "evt_20260416_000001",
  "event_type": "settings_updated",
  "occurred_at": "2026-04-16T10:12:00Z",
  "sequence": 101,
  "home_id": "home_001",
  "change_domain": "SETTINGS",
  "snapshot_required": true,
  "related_request_id": null,
  "payload": {}
}
```

字段约束：

1. `event_id`：事件唯一 ID，至少在 `home_id` 范围唯一。
2. `sequence`：连接内单调递增，重连后可重新计数。
3. `occurred_at`：事件发生时间（UTC ISO 8601）。
4. `related_request_id`：控制相关事件必填，非控制事件可为 `null`。
5. `snapshot_required`：是否要求前端立即补拉快照接口。

---

## 五、广播范围定义

1. 当前终端：仅触发动作的连接会收到。
2. 全部在线终端：同 `home_id` 下所有在线连接都会收到。
3. 管理终端：同 `home_id` 且具管理权限的终端收到。

---

## 六、事件类型契约

| event_type | change_domain | payload 字段（最小集） | 触发时机 | 广播范围 | related_request_id 规则 |
| --- | --- | --- | --- | --- | --- |
| `settings_updated` | `SETTINGS` | `settings_version, updated_domains, effective_at` | Save All 成功并提交事务后 | 全部在线终端 | `null` |
| `publish_succeeded` | `LAYOUT` | `layout_version, effective_at, published_by_terminal_id` | Publish 成功并提交事务后 | 全部在线终端 | `null` |
| `backup_restore_completed` | `BACKUP` | `backup_id, settings_version, layout_version, effective_at, restored_by_terminal_id` | Restore 成功并提交事务后 | 全部在线终端 | `null` |
| `device_state_changed` | `DEVICE_STATE` | `device_id, confirmation_type, execution_status, runtime_state, error_code, error_message` | 控制执行状态变化或设备状态回推 | 全部在线终端 | 控制触发时必填 |
| `summary_updated` | `SUMMARY` | `summary, updated_at` | 首页摘要统计发生变化 | 全部在线终端 | 非控制触发可 `null` |
| `draft_lock_lost` | `EDITOR_LOCK` | `lease_id, terminal_id, lost_reason` | lease 过期或被接管后 | 当前终端 + 管理终端 | `null` |
| `draft_taken_over` | `EDITOR_LOCK` | `previous_terminal_id, new_terminal_id, new_operator_id, new_lease_id, draft_version` | takeover 成功后 | 全部在线终端 | `null` |
| `energy_refresh_completed` | `ENERGY` | `refresh_status, updated_at, snapshot_version` | 电量刷新任务完成 | 全部在线终端 | `null` |
| `media_state_changed` | `MEDIA` | `device_id, play_state, track_title, artist, availability_status, confirmation_type, execution_status, runtime_state, error_code, error_message` | 媒体绑定设备状态变化 | 全部在线终端 | 控制触发时必填 |
| `ha_sync_degraded` | `SUMMARY` | `status, reason, detected_at` | HA 同步降级判定成立 | 管理终端 + 首页在线终端 | `null` |
| `ha_sync_recovered` | `SUMMARY` | `status, recovered_at` | HA 同步恢复判定成立 | 管理终端 + 首页在线终端 | `null` |

---

## 七、last_event_id 重连补偿规则

### 7.1 客户端重连参数

1. 客户端重连时应携带 `last_event_id`（最近已成功处理事件）。
2. 客户端同时重置本地连接态 `sequence` 预期，不跨连接比较历史 `sequence`。

### 7.2 服务端补偿流程

1. 若 `last_event_id` 存在且可在 outbox 窗口定位，按 `occurred_at,event_id` 顺序回放后续事件。
2. 若 `last_event_id` 不存在、过期或被清理，发送一条 `snapshot_required=true` 的补偿提示事件。
3. 回放期间不得重写事件内容；只允许补发原事件。

### 7.3 回放失败降级

1. 任一事件缺失或顺序无法保证时，立即转快照补偿。
2. 快照补偿接口至少包含：`GET /home/overview`、`GET /settings`、`GET /editor/draft`、`GET /energy`、`GET /media/default`。

---

## 八、snapshot 补偿规则

1. 以下情况必须触发快照补偿：
   - 收到 `snapshot_required=true`
   - 检测到当前连接 `sequence` 缺口
   - `last_event_id` 增量补偿失败
2. 补偿执行顺序建议：布局/设置版本 -> 首页摘要 -> 编辑态 -> 电量 -> 媒体。
3. 补偿完成后更新本地版本基线，避免重复拉取。

---

## 九、前端去重与乱序处理规则

1. 去重键：`event_id`。
2. 客户端维护最近 N 条 `event_id`（建议 N=2000）LRU 集合。
3. 同一连接内 `sequence` 必须严格递增；若跳号则进入补偿流程。
4. 若先收到增量后收到旧快照数据，前端以版本号与 `occurred_at` 决定是否丢弃旧数据。
5. 控制相关 UI 更新必须按 `related_request_id` 归并，避免跨请求污染。

---

## 十、后端 outbox 与投递约束

1. 所有业务事件先写 `ws_event_outbox`，后由 dispatcher 投递。
2. `ws_event_outbox` 必须保证 `(home_id,event_id)` 唯一。
3. dispatcher 重试不得生成新 `event_id`，只能重投原事件。
4. `occurred_at` 取业务事务提交时刻，不取投递时刻。

---

## 十一、验收标准

1. 事件类型、payload 字段、广播范围与本契约完全一致。
2. 重连场景必须验证 `last_event_id` 成功回放与失败降级两条路径。
3. 客户端必须通过自动化测试验证“去重 + 乱序 + 补偿”三类处理。
