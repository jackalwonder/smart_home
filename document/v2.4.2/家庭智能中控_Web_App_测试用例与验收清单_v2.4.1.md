# 《家庭智能中控 Web App 测试用例与验收清单 v2.4.1》

## 一、冲突扫描与推荐修订口径（先行）

### 1.1 已发现冲突

1. 编辑会话入口在少量历史文档中出现 `GET /api/v1/editor/sessions`，与冻结接口 `POST /api/v1/editor/sessions` 冲突。
2. WebSocket 重连仅强调快照补偿，未明确 `last_event_id` 增量补偿流程。

### 1.2 推荐修订口径

1. 测试基线统一采用 `POST /api/v1/editor/sessions`。
2. 重连用例按“先增量补偿、失败再快照补偿”执行。

---

## 二、文档信息

- 文档名称：家庭智能中控 Web App 测试用例与验收清单 v2.4.1
- 文档类型：测试实施与验收基线
- 适用范围：首页、设备控制、PIN、Save All、Publish、编辑锁、WebSocket、降级、电量、备份恢复

---

## 三、测试分层定义

1. 单元测试（UT）：Policy、Assembler、Service 纯逻辑与分支。
2. 集成测试（IT）：Repository + DB 事务 + 唯一约束 + outbox 落库。
3. 接口契约测试（CT）：HTTP/WS 外壳、字段、错误码、枚举、状态码。
4. 端到端测试（E2E）：前后端真实交互、页面行为、WS 实时同步。

---

## 四、测试用例清单

| 编号 | 测试层级 | 场景 | 前置条件 | 操作步骤 | 预期结果 | 涉及接口 | 涉及 WS 事件 | 验收标准 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UT-AUTH-001 | UT | Bearer token 解析成功 | 有合法 token | 调用鉴权依赖解析 | 返回 `home_id/terminal_id` | HTTP 鉴权依赖 | 无 | claim 与上下文一致 |
| UT-AUTH-002 | UT | token 过期拒绝 | token `exp` 已过期 | 调用鉴权依赖 | 抛 `UNAUTHORIZED` | HTTP 鉴权依赖 | 无 | 错误码一致 |
| UT-PIN-001 | UT | PIN 锁定倒计时判断 | 有失败次数与锁定时间 | 执行 PIN 校验逻辑 | 返回 `PIN_LOCKED` | `POST /auth/pin/verify` 逻辑 | 无 | 锁定窗口计算正确 |
| UT-CONTROL-001 | UT | request_id 语义冲突判定 | 已存在 request_id | 发送同 request_id 不同 payload | 返回 `REQUEST_ID_CONFLICT` | `POST /device-controls` 逻辑 | 无 | 不重复下发控制 |
| UT-SETTINGS-001 | UT | Save All 版本冲突判定 | 当前版本为 V2 | 以 V1 提交 Save All | 返回 `VERSION_CONFLICT` | `PUT /settings` 逻辑 | 无 | 不写入新版本 |
| UT-EDITOR-001 | UT | lock_status 推导 | 有 active lease 属于他人 | 请求进入编辑态 | `lock_status=LOCKED_BY_OTHER` | 编辑策略逻辑 | 可选 `draft_lock_acquired` | 推导结果不回写 DB |
| UT-WS-001 | UT | WS 去重规则 | 已处理 event_id | 再收到同 event_id | 忽略重复事件 | WS 客户端处理逻辑 | 任意 | 幂等处理生效 |
| IT-DB-001 | IT | 控制幂等唯一约束 | 建表完成 | 插入同 `(home_id,request_id)` 两次 | 第二次冲突 | `device_control_requests` | 无 | 唯一约束生效 |
| IT-DB-002 | IT | 编辑锁单活跃约束 | 建表完成 | 同 home 并发创建 2 个 active lease | 仅 1 个成功 | `draft_leases` | `draft_lock_acquired` | partial unique 生效 |
| IT-OUTBOX-001 | IT | Save All 与 outbox 同事务 | 有有效 settings_version | 执行 Save All | settings 快照和 outbox 同时提交 | `PUT /settings` | `settings_updated` | 任一失败则全回滚 |
| IT-OUTBOX-002 | IT | Publish 与 outbox 同事务 | 有 active lease 与 draft | 执行 Publish | layout_version 与 outbox 同时提交 | `POST /editor/publish` | `publish_succeeded` | 不出现版本已切换但无事件 |
| IT-OUTBOX-003 | IT | 备份恢复与 outbox 同事务 | 有有效 backup | 执行 restore | 新 settings/layout 版本与 outbox 同时提交 | `POST /system/backups/{id}/restore` | `backup_restore_completed` | 不覆盖历史版本 |
| IT-ENERGY-001 | IT | 能耗刷新事件写入 | 已绑定电量账号 | 触发刷新任务 | 写 snapshot 并入 outbox | `POST /energy/refresh` | `energy_refresh_completed/failed` | 刷新完成可追踪 |
| CT-HTTP-001 | CT | 统一成功外壳 | 任一 GET 接口 | 调用接口 | `success/data/error/meta` 完整 | 多个 GET | 无 | 外壳字段完整、snake_case |
| CT-HTTP-002 | CT | 统一错误外壳 | 构造未授权请求 | 调用接口 | `success=false + error.code` | 多个接口 | 无 | 无裸错误 |
| CT-CONTROL-001 | CT | 控制受理语义 | 设备在线可控 | `POST /device-controls` | 返回受理字段，不返回最终执行态 | `POST /device-controls` | 后续控制事件 | 202/受理契约一致 |
| CT-CONTROL-002 | CT | 控制结果 TIMEOUT 语义 | 构造超时执行 | `GET /device-controls/{request_id}` | `success=true` 且 `execution_status=TIMEOUT` | `GET /device-controls/{request_id}` | `device_state_changed` | 与响应规范一致 |
| CT-SETTINGS-001 | CT | Save All 错误码约束 | 缺失 PIN | 执行 Save All | 返回 `PIN_REQUIRED` | `PUT /settings` | 无 | 不返回通用 500 |
| CT-EDITOR-001 | CT | Publish 冲突错误码 | base_layout_version 过期 | 执行 Publish | `VERSION_CONFLICT` | `POST /editor/publish` | 可选 `version_conflict_detected` | 错误码准确 |
| CT-WS-001 | CT | 事件外壳校验 | 有 WS 连接 | 收到任意事件 | 含 `event_id,event_type,occurred_at,sequence,home_id,change_domain,snapshot_required,payload` | `/ws` | 全部 | 字段齐全 |
| CT-WS-002 | CT | related_request_id 规则 | 控制引发状态变化 | 收到控制相关事件 | payload 含 `related_request_id` | `/ws` | `device_state_changed/media_state_changed` | 与控制请求可关联 |
| CT-WS-003 | CT | 快照补偿触发 | 模拟乱序或缺口 | 收到 gap | 进入补偿流程 | `/ws` + GET 快照接口 | 任意 `snapshot_required=true` | 客户端触发补拉 |
| E2E-HOME-001 | E2E | 首页首屏 + 实时更新 | 已登录且 WS 连通 | 打开首页并触发设备变化 | 首屏成功，状态随 WS 更新 | `GET /home/overview` | `summary_updated/device_state_changed` | 页面无手动刷新即可更新 |
| E2E-CONTROL-001 | E2E | 控制闭环 | 设备在线 | 发控制 -> 收事件 -> 查询结果 | UI 从 pending 到 final，结果一致 | `POST/GET /device-controls` | `device_state_changed` | 三段状态完整 |
| E2E-PIN-001 | E2E | PIN 保护流程 | 无 active pin_session | 访问受保护操作 | 先弹 PIN，验证后放行 | `POST /auth/pin/verify` + 受保护接口 | 无 | 保护边界正确 |
| E2E-SAVEALL-001 | E2E | Save All 跨终端同步 | 两个终端在线 | 终端 A Save All | 终端 B 收到 settings 事件并更新 | `PUT /settings` | `settings_updated` | 版本一致 |
| E2E-PUBLISH-001 | E2E | Publish 跨终端同步 | 两个终端在线，A 持锁 | A 发布草稿 | B 收到 publish 事件并刷新布局 | `POST /editor/publish` | `publish_succeeded` | layout_version 同步 |
| E2E-LOCK-001 | E2E | 编辑锁接管 | A 已持锁，B 尝试接管 | B 执行 takeover | A 收到 lost，B 获得新 lease | `POST /editor/sessions/{lease_id}/takeover` | `draft_taken_over,draft_lock_lost` | 单活跃锁保持 |
| E2E-ENERGY-001 | E2E | 电量刷新完成事件 | 已绑定电量账号 | 手动刷新电量 | 页面刷新状态完成并更新数据 | `POST /energy/refresh`, `GET /energy` | `energy_refresh_completed` | 状态流转正确 |
| E2E-MEDIA-001 | E2E | 媒体状态实时更新 | 已绑定默认媒体 | 触发播放态变化 | 卡片播放信息实时变化 | `GET /media/default` | `media_state_changed` | UI 与事件一致 |
| E2E-BACKUP-001 | E2E | 备份恢复全端同步 | 有备份记录，双终端在线 | 终端 A 恢复备份 | 两端同时更新 settings/layout 版本 | `POST /system/backups/{id}/restore` | `backup_restore_completed` | 双版本同步无分叉 |
| E2E-DEGRADE-001 | E2E | HA 降级可用性 | 模拟 HA 不可用 | 打开首页与系统页 | 页面可展示，提示降级状态 | `GET /home/overview`, `GET /system-connections` | `ha_sync_degraded/recovered` | 不崩溃，状态可见 |

---

## 五、阶段性验收标准

1. M1（最小闭环）必须通过：`auth/session`、PIN、`home/overview`、`device-controls`、`settings`、`editor/publish`、`ws/outbox` 相关全部 CT + E2E 用例。
2. 所有 IT 用例必须验证数据库唯一约束和事务回滚行为。
3. 所有 CT 用例必须检查字段命名、枚举和值域，不允许“字段存在但语义错误”。
4. 所有 E2E 用例必须覆盖至少 2 个终端的版本/事件同步链路。

---

## 六、禁止事项

1. 用手工接口验证替代自动化用例并宣布通过。
2. 将 `REQUEST_ID_CONFLICT`、`VERSION_CONFLICT`、`DRAFT_LOCK_*` 合并成通用错误。
3. 跳过 WebSocket 乱序、重连、补偿测试。
