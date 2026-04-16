# 《家庭智能中控 Web App 开发任务拆解与 Roadmap v2.4.1》

## 一、冲突扫描与推荐修订口径（先行）

### 1.1 已发现冲突

1. 少量历史文档存在 `GET /api/v1/editor/sessions` 表述，与接口清单 `POST /api/v1/editor/sessions` 冲突。
2. WebSocket 重连补偿缺少 `last_event_id` 增量回放流程定义。

### 1.2 推荐修订口径

1. 编辑会话统一按 `POST /api/v1/editor/sessions` 实现与验收。
2. 实时链路统一按“outbox -> WS 投递 -> last_event_id 回放 -> snapshot 兜底”落地。

---

## 二、总体原则

1. 不新增产品范围，不变更冻结业务口径。
2. 后端仅使用 Python 3.12 + FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2。
3. Save All / Publish 分离、`request_id` 幂等、`lease+heartbeat`、outbox 规则不可破坏。
4. 每阶段必须有可验证产物，禁止“代码已写但不可验证”。

---

## 三、阶段任务总表

| 阶段 | 输入文档 | 目标 | 涉及文件（示例） | 完成标准 | 验证方式 | 禁止事项 |
| --- | --- | --- | --- | --- | --- | --- |
| 1. 数据库 | DDL v2.4、ER v2.4、数据库模型初稿 v2.4 | 冻结 DB 真源结构 | `backend/alembic/versions/*`, `document/v2.4/*.sql` | 关键表与约束落地（`request_id` UK、lease partial UK、outbox UK） | `psql` 检查约束、建表脚本回放 | 手改线上表不入迁移 |
| 2. Alembic | 技术栈 v2.4、后端骨架 v2.4.1 | 建立可回放 migration 流程 | `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/versions/*` | 新环境可 `upgrade head` 成功 | CI 执行迁移、回滚演练 | 手工 SQL 与迁移脚本双轨漂移 |
| 3. SQLAlchemy Models | Repository 骨架 v2.4.1 | 建立 ORM 模型与表结构映射 | `backend/src/infrastructure/db/models/*` | 模型字段、索引、关系与 DDL 对齐 | 模型导入检查 + 集成查询 | 在模型层写业务逻辑 |
| 4. Repository | Repository 草案 v2.4、骨架 v2.4.1 | 实现 base/query repository | `backend/src/repositories/*`, `backend/src/infrastructure/db/repositories/*` | Query/Command 边界清晰，关键查询可复用 | Repository 集成测试 | 在 Repository 返回 HTTP DTO |
| 5. Service | 映射表 v2.4、联调表 v2.4.1 | 落业务编排与事务边界 | `backend/src/modules/*/services/*` | Save All/Publish/Restore/Control 事务闭环 | Service UT + IT | Controller 内拼事务 |
| 6. API | 接口清单 v2.4、响应规范 v2.4 | 完成 HTTP 路由和响应外壳 | `backend/src/modules/*/controllers/*`, `backend/src/app/routing/*` | 所有冻结接口可用且外壳统一 | 契约测试 + OpenAPI 校验 | 裸返回、字段乱命名 |
| 7. WS | WS 契约 v2.4.1、映射表 v2.4 | 完成 outbox 分发、重连补偿 | `backend/src/modules/realtime/*`, `backend/src/infrastructure/outbox/*` | 事件外壳、广播范围、补偿规则完整 | WS 契约测试、断线重连测试 | 事务前直接现发事件 |
| 8. 前端 API Client | 联调表 v2.4.1 | 封装 API/WS 调用层 | `frontend/src/api/*`, `frontend/src/ws/*` | 接口类型与错误码映射稳定 | CT + mock 校验 | 页面直接散调 API |
| 9. Store | 联调表 v2.4.1、WS 契约 v2.4.1 | 建立状态管理与事件归并 | `frontend/src/stores/*` | HTTP 初始态与 WS 增量态可合并 | Store 单测 + E2E | 仅靠 WS 不做首拉 |
| 10. 页面接入 | PRD v2.4、接口清单 v2.4 | 页面与组件接入真实数据 | `frontend/src/pages/*`, `frontend/src/components/*` | 首页/设置/编辑/电量/媒体/备份页面可操作 | 交互走查 + E2E | 新增未冻结交互 |
| 11. 联调 | 联调表 v2.4.1 | 打通前后端主链路 | `frontend+backend` 全链路 | HTTP + WS + 错误码 + 补偿一致 | 联调 checklist + 双端日志 | 只验证 happy path |
| 12. 测试 | 测试清单 v2.4.1 | 全层测试收敛 | `backend/tests/*`, `frontend/tests/*` | UT/IT/CT/E2E 通过率达标 | CI 门禁 | 跳过关键冲突用例 |
| 13. 部署 | 部署文档 v2.4.1 | 交付可部署版本 | `docker-compose.yml`, `.env*`, CI/CD 配置 | 一键部署与健康检查可用 | 预发演练、回滚演练 | 未迁移先发布、明文密钥 |

---

## 四、第一批最小可运行闭环（M1）

### 4.1 闭环范围（必须全部打通）

1. `GET /api/v1/auth/session`
2. `POST /api/v1/auth/pin/verify`
3. `GET /api/v1/home/overview`
4. `POST /api/v1/device-controls`
5. `GET /api/v1/device-controls/{request_id}`
6. `GET /api/v1/settings`
7. `PUT /api/v1/settings`
8. `POST /api/v1/editor/publish`
9. `/ws` + `ws_event_outbox` dispatcher

### 4.2 M1 目标

1. 用户可登录进入首页并发起控制。
2. Save All 可生成新 `settings_version` 并广播 `settings_updated`。
3. Publish 可生成新 `layout_version` 并广播 `publish_succeeded`。
4. 控制链路满足 `request_id` 幂等与最终结果可查询。

### 4.3 M1 验证

1. 两终端在线，A Save All，B 自动更新设置版本。
2. 两终端在线，A Publish，B 自动更新布局版本。
3. 控制请求重复提交：同语义重放、异语义冲突。
4. WS 断线重连后可完成补偿。

### 4.4 M1 禁止事项

1. 以 mock 事件替代 outbox 真链路验收。
2. 省略 PIN 保护直接放开管理接口。
3. 把 Publish 做成 Save All 子流程。

---

## 五、里程碑建议

1. M1：核心链路可运行（auth/PIN/home/control/settings/publish/ws）。
2. M2：编辑锁全流程（session/heartbeat/takeover/draft/discard）。
3. M3：系统能力补齐（energy/media/system-connections/backups）。
4. M4：部署、压测、故障演练、验收签收。

---

## 六、跨阶段质量闸口

1. Schema 闸口：OpenAPI 与 Pydantic 模型字段完全一致。
2. 事务闸口：Save All / Publish / Restore / 控制写路径必须验证事务一致性。
3. 事件闸口：所有冻结事件必须可在 outbox 与客户端日志双向追踪。
4. 回归闸口：每次改动必须通过最小闭环回归集。

---

## 七、执行建议

1. 每阶段结束必须更新“完成标准证据”（测试报告、日志、截图、SQL 检查结果）。
2. 每周至少一次跨前后端事件契约对账，避免字段漂移。
3. 对冲突项优先修文档再改代码，确保实施基线单一。
