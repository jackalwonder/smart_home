# 《家庭智能中控 Web App 现场安装与终端恢复操作手册 v2.4.2》

## 一、适用范围

本手册用于现场安装、终端重装、换机和恢复。优先使用“安装期绑定码”完成终端激活；只有在现场网络或屏幕输入不便时，才使用 bootstrap token、激活链接或激活码作为兜底交付方式。

---

## 二、角色与前置条件

1. 现场终端已预注册到目标家庭，拥有明确的 `terminal_id`、`terminal_code` 与 `terminal_name`。
2. 管理端已登录，并且操作者可以完成 PIN 验证。
3. 后端、前端、数据库均已发布到同一版本，Alembic migration 已执行完成。
4. 现场网络可访问后端 API，终端时间与服务端时间不应明显漂移。

---

## 三、推荐流程：安装期绑定码

1. 在未激活终端打开前端。
2. 终端激活页自动签发短时绑定码，格式类似 `ABCD-2345`。
3. 在已登录管理端进入“设置 -> 系统 -> Pairing claim”。
4. 按提示完成 PIN 验证。
5. 输入终端屏幕上的绑定码并提交。
6. 终端轮询到 bootstrap token 后会自动完成激活，并进入中控 shell。

现场口径：

1. 绑定码短时有效，默认有效期由 `PAIRING_CODE_TTL_SECONDS` 控制。
2. 绑定码只能认领一次。
3. 同一终端重复刷新绑定码受 `PAIRING_CODE_ISSUE_COOLDOWN_SECONDS` 保护，默认 30 秒；冷却期内继续使用屏幕上已有绑定码，或等待后再刷新。
4. 刷新签发新绑定码后，旧的未认领绑定码会失效。
5. 不拍照长期留存绑定码，不通过公开群聊转发绑定码。

---

## 四、兜底流程：bootstrap token / 激活链接 / 激活码

当现场无法使用绑定码时，在管理端“设置 -> 系统 -> Bootstrap token”选择目标终端并创建或重置 token。

交付优先级：

1. 激活二维码：适合终端有摄像头或现场可扫码。
2. 激活链接：适合可远程打开终端浏览器。
3. 激活码：适合手工输入。
4. bootstrap token 原文：仅限受控排障，不建议作为常规交付方式。

终端激活成功后，会把 bootstrap token 写入本地 `smart_home.bootstrap_token`，后续刷新页面不需要再次输入。

---

## 五、重装与换机

终端重装：

1. 在管理端对同一 terminal 执行“Reset bootstrap token”。
2. 旧 token、旧激活链接、旧激活码立即失效。
3. 优先让重装后的终端重新显示绑定码并完成认领。
4. 如果绑定码流程不可用，再交付新的二维码、激活链接或激活码。

现场换机：

1. 先为替换设备完成 terminal 档案创建或预注册。
2. 使用新 terminal 的绑定码完成认领。
3. 确认旧设备不再使用后，重置或撤销旧 terminal 的 bootstrap token。
4. 在审计日志中核对新旧 terminal 的 token 创建/重置记录。

---

## 六、观测与验收

安装完成后检查 `/observabilityz`：

1. `terminal_pairing.requests_total` 应随签发和轮询增加。
2. `terminal_pairing.event_counts.issue_success` 应有新增。
3. `terminal_pairing.event_counts.claim_success` 应有新增。
4. `terminal_pairing.event_counts.poll_delivered` 应有新增。
5. `terminal_pairing.event_counts.issue_cooldown` 只应在重复刷新时少量出现。
6. `terminal_pairing.event_counts.claim_failed_malformed` 与 `claim_failed_expired_or_invalid` 不应持续增长。
7. `legacy_context.runtime_accepted_requests_total` 必须保持为 0。

审计日志检查：

1. 每次绑定码签发都有 `TERMINAL_PAIRING_CODE_ISSUED`。
2. 每次认领成功都有 `TERMINAL_PAIRING_CODE_CLAIMED`。
3. 认领失败只记录失败原因，不记录绑定码明文。

---

## 七、常见故障

绑定码一直停留在 Waiting for claim：

1. 确认管理端已完成 PIN 验证。
2. 确认输入的是当前屏幕显示的最新绑定码。
3. 确认终端网络可访问后端。
4. 确认终端没有进入休眠，浏览器轮询未被系统节流。

刷新绑定码提示刚刚签发：

1. 这是安全冷却保护，默认等待 30 秒。
2. 如果屏幕上仍有绑定码，优先继续认领当前绑定码。
3. 如果页面已刷新且看不到旧绑定码，等待冷却结束后重新刷新。

管理端提示绑定码无效或过期：

1. 确认没有输入历史绑定码。
2. 确认绑定码属于当前家庭下的终端。
3. 让终端刷新生成新的绑定码，再重新认领。

认领成功但终端没有自动进入中控：

1. 检查终端轮询接口 `GET /api/v1/terminals/{terminal_id}/pairing-code-sessions/{pairing_id}` 是否返回 `DELIVERED`。
2. 检查服务端时间与终端时间是否明显漂移。
3. 刷新终端页面；若仍失败，使用 bootstrap token 兜底流程恢复。

---

## 八、禁止事项

1. 禁止在生产环境使用示例密钥或默认密钥。
2. 禁止在群聊、工单正文或截图中长期保存 bootstrap token 原文。
3. 禁止绕过 PIN 验证直接让未授权人员认领绑定码。
4. 禁止在旧设备仍可访问现场网络时复用其 token 给新设备。
5. 禁止把 `/observabilityz` 暴露到公网未受控入口。
