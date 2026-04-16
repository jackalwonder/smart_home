# 家庭智能中控 Web App v2.4.2 当前开发基线

本目录 `document/v2.4.2/` 是当前重新开发、联调、测试、部署的统一文档入口。

## 使用规则

1. 新开发只看 `document/v2.4.2/`，不要再以 `document/v2.4/` 或 `document/v2.4.1/` 作为执行基线。
2. 文件名中保留 `v2.4` 或 `v2.4.1` 的文档，表示“继承冻结文档名，不代表旧基线”；只要位于 `v2.4.2/` 目录内，就按 v2.4.2 收口后的版本使用。
3. 若文档之间出现冲突，以 `家庭智能中控_Web_App_v2.4.2_一致性收口报告.md` 的收口结论为准。
4. 后端实现方向统一为 Python 3.12 + FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2。
5. 前端不得直连 Home Assistant，必须通过自有后端与 OpenAPI/WS 契约接入。

## 推荐阅读顺序

1. `家庭智能中控_Web_App_v2.4.2_一致性收口报告.md`
2. `家庭智能中控_Web_App_文档总览_v2.4.2.md`
3. `《家庭智能中控 Web App PRD v2.4》.md`
4. `《家庭智能中控 Web App 接口清单 v2.4》.md`
5. `《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》.md`
6. `家庭智能中控_Web_App_后端模块骨架与目录设计_v2.4.1.md`
7. `家庭智能中控_Web_App_Repository接口定义代码骨架_v2.4.1.md`
8. `家庭智能中控_Web_App_接口冻结联调表_v2.4.1.md`
9. `家庭智能中控_Web_App_WebSocket事件契约_v2.4.1.md`
10. `家庭智能中控_Web_App_鉴权迁移与安全威胁模型_v2.4.2.md`
11. `家庭智能中控_Web_App_前端架构与接入方案_v2.4.2.md`
12. `家庭智能中控_Web_App_OpenAPI与前端类型生成规范_v2.4.2.md`
13. `家庭智能中控_Web_App_开发任务拆解与Roadmap_v2.4.1.md`
14. `家庭智能中控_Web_App_测试用例与验收清单_v2.4.1.md`
15. `家庭智能中控_Web_App_部署与环境变量文档_v2.4.1.md`
16. `家庭智能中控_Web_App_观测性_日志与审计规范_v2.4.2.md`
17. `家庭智能中控_Web_App_CI_CD与质量门禁规范_v2.4.2.md`

## 不得改动的冻结规则

1. Save All 与 Publish 分离。
2. `request_id` 幂等规则保持不变。
3. 编辑态继续使用 lease + heartbeat 锁。
4. WebSocket 事件继续遵守 outbox 先落库再分发。
5. `backup_restore_completed`、`settings_updated`、`publish_succeeded` 事件语义保持不变。
6. PIN session 不固化进 access token claim。
7. 不新增产品范围。
