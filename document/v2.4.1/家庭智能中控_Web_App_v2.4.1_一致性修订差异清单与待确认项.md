# 《家庭智能中控 Web App v2.4.1 一致性修订差异清单与待确认项》

## 一、修订范围

本次 v2.4.1 仅做“一致性修订”，不新增产品范围，重点覆盖：

1. 后端骨架口径统一到 Python/FastAPI。
2. Repository 接口骨架统一到 Python `Protocol` 风格。
3. 鉴权方案单独成文并明确 HTTP/WS Bearer 规则。
4. 补齐开发前执行文档（联调、测试、WS 契约、部署、Roadmap）。
5. 清理 Markdown 分隔符与重复编号类格式噪音。

---

## 二、差异清单（v2.4 -> v2.4.1）

### 2.1 新增文档

1. `家庭智能中控_Web_App_后端模块骨架与目录设计_v2.4.1.md`
2. `家庭智能中控_Web_App_Repository接口定义代码骨架_v2.4.1.md`
3. `家庭智能中控_Web_App_鉴权方案说明_v2.4.1.md`
4. `家庭智能中控_Web_App_接口冻结联调表_v2.4.1.md`
5. `家庭智能中控_Web_App_测试用例与验收清单_v2.4.1.md`
6. `家庭智能中控_Web_App_WebSocket事件契约_v2.4.1.md`
7. `家庭智能中控_Web_App_部署与环境变量文档_v2.4.1.md`
8. `家庭智能中控_Web_App_开发任务拆解与Roadmap_v2.4.1.md`
9. `家庭智能中控_Web_App_v2.4.1_一致性修订差异清单与待确认项.md`（本文件）

### 2.2 原文档修订

1. `家庭智能中控_Web_App_后端模块骨架与目录设计_v2.4.md`
   - 增加“历史归档”说明，明确 v2.4.1 为正式实施基线。
2. `家庭智能中控_Web_App_Repository接口定义代码骨架_v2.4.md`
   - 增加“历史归档”说明，避免继续作为正式骨架。
3. `家庭智能中控_Web_App_Repository接口草案与读写分层定义_v2.4.md`
   - 增加 v2.4.1 解释说明。
   - 统一接口示例描述为 Python Protocol 风格。
4. `家庭智能中控_Web_App_前后端技术栈选型_v2.4.md`
   - 增加 v2.4.1 文档引用。
   - 明确后端正式骨架不再使用 `.ts` 命名。
5. `家庭智能中控_Web_App_后端接口实现映射表_v2.4.md`
   - 结论区从“多后端框架选项”收敛为 FastAPI 实施方向。
6. `《家庭智能中控 Web App 接口清单 v2.4》.md`
   - WebSocket 连接参数由“token 或会话态”改为 Bearer token 明确口径。
   - 新增鉴权方案文档引用。
   - 清理异常分隔符格式。
7. `《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》.md`
   - WebSocket 外壳章节新增 Bearer token 鉴权补充说明。
   - 清理重复编号与异常分隔符格式。
8. `《家庭智能中控 Web App PRD v2.4》.md`
   - 统一分隔符格式（`⸻` -> `---`）。

---

## 三、冻结不变项核对

以下规则在 v2.4.1 保持不变：

1. Save All 与 Publish 分离。
2. `settings_updated`、`publish_succeeded`、`backup_restore_completed` 事件语义不变。
3. `request_id` 幂等规则不变。
4. lease 锁与“单家庭单活跃 lease”规则不变。
5. outbox 事件先落库再分发规则不变。

---

## 四、仍需确认的问题

1. Access token 默认有效期当前写为 `24h`，是否要改为配置中心强制下发（并给出默认值区间）？
2. WebSocket 在浏览器端的 Bearer 传递优先级（Header / Subprotocol / Query）是否统一只保留一种官方路径？
3. 现有“PIN 保护接口名单”是否需要单独出冻结附表，避免后续接口新增时遗漏保护策略？
4. 是否需要补充 token 撤销策略（如 `jti` 黑名单或版本号失效）到实施规范？
5. 是否需要在统一响应体文档中冻结 `UNAUTHORIZED` 与 `PIN_REQUIRED` 的最小 `error.details` 字段结构？

---

## 五、结论

v2.4.1 一致性修订已完成“后端 FastAPI 口径统一 + 鉴权方案单独收口 + 执行文档补齐 + 文档格式清理”。后续后端实施与评审应以 v2.4.1 新增文档作为正式执行基线。
