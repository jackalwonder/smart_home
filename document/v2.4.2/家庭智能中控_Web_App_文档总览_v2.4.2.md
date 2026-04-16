# 《家庭智能中控 Web App 文档总览 v2.4.2》

本文件是 `document/v2.4.2/` 的完整开发基线总览。重新开发、联调、测试、部署只使用本目录，不再以 `document/v2.4/` 或 `document/v2.4.1/` 作为开发入口。

文件名中保留 `v2.4` 或 `v2.4.1` 的文档，是“继承冻结文档名，不代表旧基线”。这些文档已经放入 `v2.4.2/` 目录，按 v2.4.2 一致性收口后的当前基线使用。

## 一、入口与收口文档

1. `README_当前开发基线.md`
2. `家庭智能中控_Web_App_文档总览_v2.4.2.md`
3. `家庭智能中控_Web_App_v2.4.2_一致性收口报告.md`
4. `家庭智能中控_Web_App_v2.4.1_一致性修订差异清单与待确认项.md`

## 二、产品与冻结接口基线

1. `《家庭智能中控 Web App PRD v2.4》.md`
2. `《家庭智能中控 Web App 接口清单 v2.4》.md`
3. `《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》.md`
4. `家庭智能中控_Web_App_接口冻结联调表_v2.4.1.md`
5. `家庭智能中控_Web_App_WebSocket事件契约_v2.4.1.md`

## 三、数据库与后端实现基线

1. `家庭智能中控_Web_App_PostgreSQL首版DDL_v2.4.sql`
2. `家庭智能中控_Web_App_数据库ER图与关系说明_v2.4.md`
3. `家庭智能中控_Web_App_数据库模型初稿_v2.4.md`
4. `家庭智能中控_Web_App_后端接口实现映射表_v2.4.md`
5. `家庭智能中控_Web_App_后端模块骨架与目录设计_v2.4.1.md`
6. `家庭智能中控_Web_App_Repository接口草案与读写分层定义_v2.4.md`
7. `家庭智能中控_Web_App_Repository接口定义代码骨架_v2.4.1.md`
8. `家庭智能中控_Web_App_后端项目审查意见报告_v2.4.md`

## 四、前端、鉴权与类型生成基线

1. `家庭智能中控_Web_App_前后端技术栈选型_v2.4.md`
2. `家庭智能中控_Web_App_前端架构与接入方案_v2.4.2.md`
3. `家庭智能中控_Web_App_鉴权方案说明_v2.4.1.md`
4. `家庭智能中控_Web_App_鉴权迁移与安全威胁模型_v2.4.2.md`
5. `家庭智能中控_Web_App_OpenAPI与前端类型生成规范_v2.4.2.md`

## 五、工程执行、测试、部署与质量基线

1. `家庭智能中控_Web_App_开发任务拆解与Roadmap_v2.4.1.md`
2. `家庭智能中控_Web_App_测试用例与验收清单_v2.4.1.md`
3. `家庭智能中控_Web_App_部署与环境变量文档_v2.4.1.md`
4. `家庭智能中控_Web_App_观测性_日志与审计规范_v2.4.2.md`
5. `家庭智能中控_Web_App_CI_CD与质量门禁规范_v2.4.2.md`

## 六、当前冻结规则

1. 不新增产品范围。
2. Save All 与 Publish 分离。
3. `request_id` 幂等规则保持不变。
4. 编辑态继续使用 lease + heartbeat 锁。
5. WebSocket 事件继续遵守 outbox 先落库再分发。
6. `backup_restore_completed`、`settings_updated`、`publish_succeeded` 事件语义保持不变。
7. HTTP 与 WebSocket 的目标鉴权主干为 Bearer access token，`home_id / terminal_id` 以 token claim 为权威来源。
8. 当前实现迁移期可保留 `home_id + terminal_id + PIN session` 兼容模型，但不得把 PIN session 固化进 access token claim。
9. WebSocket 重连补偿统一为 `last_event_id` 增量回放优先，`snapshot_required=true` 快照兜底。
10. 前端不得直连 Home Assistant。

## 七、历史归档

1. `document/v2.4/` 仅用于历史追溯，不作为开发基线。
2. `document/v2.4.1/` 仅用于中间版本追溯，不作为当前开发入口。
3. 当前所有重新开发所需文档均应从 `document/v2.4.2/` 读取。
