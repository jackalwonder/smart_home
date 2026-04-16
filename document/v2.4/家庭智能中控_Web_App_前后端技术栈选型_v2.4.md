# 《家庭智能中控 Web App 前后端技术栈选型 v2.4》

## 一、文档信息

- 文档名称：家庭智能中控 Web App 前后端技术栈选型 v2.4
- 文档类型：工程实施配套文档 / 技术选型文档
- 适用对象：前端、后端、测试、运维、Codex 任务拆解
- 编制日期：2026-04-14
- 版本状态：已冻结（实施版）
- 基线文档：
  - 《家庭智能中控 Web App PRD v2.4》
  - 《家庭智能中控 Web App 接口清单 v2.4》
  - 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
  - 《家庭智能中控 Web App 数据库模型实施版 v2.4》
  - 《家庭智能中控 Web App 后端模块骨架与目录设计 v2.4》

---

## 二、冻结结论

v2.4 实施版技术栈冻结为：

1. 前端：`React + TypeScript + Vite`
2. 后端：`Python 3.12 + FastAPI`
3. 数据库：`PostgreSQL`
4. 数据访问：`SQLAlchemy 2.0 + Alembic`
5. 数据校验与配置模型：`Pydantic v2`
6. WebSocket：`FastAPI WebSocket`
7. 运行容器：`Docker`
8. 缓存/辅助基础设施：`Redis` 可选，不作为数据库真源替代

---

## 三、选型理由

### 3.1 前端

前端冻结为 `React + TypeScript + Vite`，原因：

1. 首页总览、设备详情、编辑态都属于高交互 Web UI，React 生态更成熟。
2. 前端接口契约和冻结字段较多，TypeScript 对接口字段约束更直接。
3. Vite 足够轻量，能满足当前项目体量和开发效率要求。

### 3.2 后端

后端冻结为 `FastAPI + Python`，原因：

1. 团队当前为 Python-first。
2. 后端未来会重度依赖 Python 生态。
3. FastAPI 同时满足当前项目的 HTTP、WebSocket、Pydantic 校验、OpenAPI 生成需求。
4. FastAPI 在当前团队条件下的实施成本与生态匹配度更优。

### 3.3 数据访问层

数据访问冻结为 `SQLAlchemy 2.0 + Alembic`，原因：

1. 本项目存在版本推进、编辑锁、控制幂等、outbox 等较强事务要求。
2. `SQLAlchemy 2.0` 在事务控制、查询表达、连接管理方面更稳。
3. `Alembic` 可直接承接已冻结的 PostgreSQL DDL 与后续 migration 管理。

### 3.4 Redis 定位

Redis 在 v2.4 中不是必选核心真源，只允许承担以下辅助职责：

1. 天气短 TTL 缓存。
2. WebSocket 会话或连接态辅助缓存。
3. 可选的编辑锁心跳辅助缓存。
4. outbox dispatcher 的辅助调度状态。

Redis 不得替代：

1. 编辑锁数据库真源。
2. 当前正式版本真源。
3. 控制请求幂等真源。
4. WS 事件幂等真源。

---

## 四、后端实施框架约定

`FastAPI` 实施版约定如下：

1. HTTP 路由使用 `APIRouter` 分模块组织。
2. WebSocket 使用 FastAPI 原生 `WebSocket` 入口。
3. 依赖注入使用 FastAPI `Depends` 加应用层容器封装。
4. Query Service 与 Command Service 继续按冻结文档分离。
5. Repository 接口层使用 Python `Protocol` 或等价抽象。
6. 事务统一通过 `UnitOfWork` 抽象协调，不在 Controller 中打开事务。

---

## 五、前后端目录约定

目录冻结为：

```text
frontend/
  src/
  public/

backend/
  pyproject.toml
  src/
    main.py
    shared/
    infrastructure/
    repositories/
    modules/
  tests/
```

说明：

1. `frontend/` 在本阶段尚未创建真实代码，不影响本次冻结。
2. `backend/src/` 保持为 Python 应用包根目录，承接既有工程文档里的模块分层。

---

## 六、与冻结工程文档的关系（v2.4.1 对齐）

本文件冻结后，以下文档的实现方向统一解释为 Python/FastAPI：

1. 《后端模块骨架与目录设计 v2.4.1》
2. 《Repository 接口与读写分层定义 v2.4》
3. 《Repository 接口定义代码骨架 v2.4.1》
4. 《鉴权方案说明 v2.4.1》

上述文档已以 Python/FastAPI 口径收口，后续实现不再使用 `.ts` 作为后端正式骨架文件命名。

---

## 七、下一步实施顺序

本文件冻结后，后端下一步实施顺序固定为：

1. 按 v2.4.1 骨架直接创建 Python/FastAPI 目录与接口文件。
2. 先落 `shared/kernel`、Repository 接口、首批模块 `auth / home_overview / device_control`。
3. 再补 `UnitOfWork`、Repository Impl、DTO 与响应装配。
4. 最后接 `settings / editor / realtime` 与数据库集成。

---

## 八、结论

后端实施方向已统一为 `Python 3.12 + FastAPI + SQLAlchemy 2.0 + Pydantic v2`。
