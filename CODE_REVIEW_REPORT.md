# 代码审阅报告

## 1. 审阅结论摘要

- 项目整体质量判断：仓库已经具备较完整的前后端分层、CI、契约生成、限流、统一响应、审计/实时事件与较丰富测试，工程基础明显优于早期原型项目；但仍存在访问令牌生命周期、核心写接口输入校验、外部连接边界和设备控制一致性方面的真实风险。
- 当前是否适合上线/合并/继续迭代：建议继续迭代；不建议在未处理 P1 问题前作为生产版本无条件上线。若只进入受控内网试运行，需要配套限制网络入口、缩短 token 有效期并加强运行监控。
- 最大的 3 个风险：
  - 已签发 access token 只校验签名与过期时间，未与终端状态、bootstrap token 轮换或服务端撤销状态联动。
  - 设置保存接口使用 `dict[str, Any]` 和裸类型转换， malformed payload 可能触发 500，甚至写入非预期配置。
  - Home Assistant 连接测试/保存接受任意 `base_url`，后端会发起服务端请求，存在 SSRF/内网探测风险。
- 最值得优先改进的 3 个方向：
  - 建立可撤销/可收敛的会话模型：短 access token、refresh/rotation、jti denylist 或终端状态校验。
  - 为核心写接口补齐 Pydantic 结构化请求模型、范围校验和异常路径测试。
  - 对外部 URL、文件路径、Docker/socket 控制面做白名单、scheme/host 限制和安全审计。

## 2. 项目概况

- 项目技术栈：
  - 后端：Python 3.12、FastAPI、SQLAlchemy 2.0、Alembic、Pydantic 2、Redis、Injector。
  - 前端：React 19、TypeScript 5.8、Vite 6、React Router 7、Vitest、Playwright。
  - 基础设施：Docker Compose、PostgreSQL 16、Redis 7、Nginx、GitHub Actions。
  - 集成：Home Assistant、SGCC 电费 sidecar、Open-Meteo。
- 主要模块结构：
  - `backend/src/modules`：auth、settings、editor、device_control、home_overview、system_connections、energy、media、page_assets、backups、realtime。
  - `backend/src/infrastructure`：数据库、HA 网关、天气、能力提供者、安全加密、文件存储。
  - `backend/src/repositories`：base/query/read_models/rows 抽象与实现。
  - `frontend/src`：api、auth、ws、store、pages、components、settings、editor、view-models、styles。
- 核心业务流程：
  - 终端激活：bootstrap token 或开发绕过获取 session 与 access token。
  - 管理操作：access token 认证后，部分敏感写操作再要求 PIN session。
  - 首页与设备控制：查询概览/设备目录，提交 HA 控制请求，并通过 outbox/WebSocket 推送变化。
  - 设置与编辑器：读取/保存设置、草稿编辑、发布布局、备份与恢复。
  - 集成同步：HA 实体同步、SGCC 二维码登录/电费刷新、天气读取。
- 构建、测试、运行方式：
  - Docker Compose 启动前端、后端、PostgreSQL、Redis、HA 与 SGCC sidecar。
  - 后端命令见 README 和 CI：ruff、pip-audit、pytest unit/integration。
  - 前端命令：lint、format:check、typecheck、test、build、test:e2e。
- 本次审阅覆盖范围：
  - 已阅读 README、Makefile、Docker Compose、Dockerfile、CI、后端配置/入口/路由注册/异常处理/限流/认证/设置/备份/设备控制/资产/HA 网关/实时服务、前端入口/API/Auth/WebSocket/配置、主要测试目录。
  - 未逐行审阅全部 UI 样式和所有 read model SQL；对 SQL 注入风险采用抽样审阅，重点看动态 SQL 构造方式与参数绑定。

## 3. 评分总览

| 评分项 | 权重 | 得分 | 扣分原因摘要 |
|---|---:|---:|---|
| 功能正确性与稳定性 | 20 | 16 | 核心路径设计完整，但设置保存异常输入会 500，设备控制提交与状态落库非原子，存在边界一致性风险。 |
| 架构设计与模块边界 | 15 | 12 | 模块分层清楚，仓储和服务边界较好；但 DI getter 数量较多，部分服务直接处理外部系统细节，配置/控制面边界仍偏松。 |
| 代码可读性与可维护性 | 15 | 12 | 命名和分层总体清晰；但若干核心接口大量使用 `dict[str, Any]`，隐式字段约定较多，后端静态检查偏弱。 |
| 安全性与合规风险 | 15 | 10 | 密钥强度校验、secret scan、CSP、限流已有基础；主要扣分来自 token 撤销缺失、bootstrap token localStorage 持久化、SSRF 边界不足。 |
| 测试质量与覆盖度 | 10 | 7 | 单元/集成/前端测试数量充足，CI 覆盖较完整；缺少设置服务真实校验、token 撤销、安全边界、并发幂等和失败恢复测试。 |
| 性能与资源使用 | 10 | 8 | 暂未发现明显 N+1 或无界内存问题；能耗自动刷新按账户串行，WebSocket backlog 固定 100 条，长期规模化存在优化空间。 |
| 工程化与开发体验 | 5 | 4 | CI 完整、Docker 镜像 digest pin 良好；本机 README 推荐 `uv` 但环境未提供，Makefile 偏 Unix，不利于 Windows 开发。 |
| 文档与注释质量 | 5 | 4 | README 和 `document/v2.4.2` 文档较完整；但本地依赖安装、Python 版本、生成命令副作用说明还可更明确。 |
| 日志、监控与可观测性 | 5 | 4 | 有 trace_id、结构化 HTTP/WS 日志、观测指标接口；缺少指标系统接入、告警、关键业务审计覆盖说明。 |
| 总分 | 100 | 77 | 中等偏上，工程基础扎实，但建议修复关键安全与稳定性问题后再上线。 |

总体等级：77/100，中等。建议修复关键问题后再上线。

## 4. 关键问题清单

### [P1] Access token 缺少服务端撤销与终端状态校验

- 位置：`backend/src/modules/auth/services/query/AccessTokenResolver.py:143`，涉及函数/类：`JwtAccessTokenResolver.resolve`
- 位置：`backend/src/modules/auth/services/query/RequestContextService.py:165`，涉及函数/类：`RequestContextService._resolve_bearer_claims`
- 问题描述：access token 是自定义 HS256 token，校验逻辑只检查签名、issuer、audience、token_use、exp、scope 和 claim 格式。`RequestContextService` 接收 bearer claims 后直接信任 `home_id`/`terminal_id`，没有查询终端是否仍有效、token jti 是否被撤销、bootstrap token 是否被轮换、终端是否被解绑。
- 影响范围：所有默认 `require_bearer=True` 的 HTTP API，以及 WebSocket bearer 鉴权。
- 风险后果：如果 access token 泄露，或管理员重置/轮换终端 bootstrap token，旧 access token 在 `access_token_ttl_seconds` 内仍可继续访问 API。当前默认 TTL 为 86400 秒，智能家居控制场景下属于较长暴露窗口。
- 修复建议：
  - 将 access token TTL 缩短到 5-15 分钟，引入 refresh/renew 流程。
  - 在服务端保存 jti/session version，并在每次鉴权时校验终端状态、token version 或 denylist。
  - 当终端 bootstrap token 重置、终端解绑、PIN 锁定或安全事件发生时，撤销相关 jti 或递增终端 session_version。
  - 优先使用成熟 JWT 库，减少自定义实现维护面。
- 参考修复方向或示例代码：
  ```python
  claims = resolver.resolve(token, required_scope="api")
  session = await token_session_repo.find_active(
      home_id=claims.home_id,
      terminal_id=claims.terminal_id,
      jti=claims.jti,
  )
  if session is None or session.revoked_at is not None:
      raise AppError(ErrorCode.UNAUTHORIZED, "access token is revoked")
  ```
- 优先级建议：第一阶段必须修复。

### [P1] 设置保存接口缺少结构化校验，异常输入会变成 500 或写入非预期配置

- 位置：`backend/src/modules/settings/controllers/SettingsController.py:48`，涉及函数/类：`SettingsSaveRequestBody`
- 位置：`backend/src/modules/settings/services/command/SettingsSaveService.py:126`，涉及函数/类：`SettingsSaveService.save`
- 位置：`backend/src/modules/settings/services/command/SettingsSaveService.py:152`，涉及函数/类：`SettingsSaveService.save`
- 问题描述：`page_settings`、`function_settings`、`favorites` 均声明为 `dict[str, Any]` 或 `list[dict[str, Any]]`。服务层直接执行 `float(...)`、`int(...)` 和 `favorite["device_id"]`。如果客户端传入 `"abc"`、`null`、缺少 `device_id`、负数阈值或超大值，可能抛出 `ValueError`/`KeyError`，进入全局 500，而不是返回 400/422。部分 JSON 字段也缺少白名单和范围约束。
- 影响范围：`PUT /api/v1/settings`，影响设置版本、首页展示策略、收藏设备、功能阈值和 WebSocket 设置变更事件。
- 风险后果： malformed payload 可导致稳定性下降；若异常未触发但值非法，可能形成不可预期的 UI/业务行为，并污染版本化设置。
- 修复建议：
  - 为保存请求定义明确的 Pydantic 子模型，例如 `PageSettingsPayload`、`FunctionSettingsPayload`、`FavoriteDevicePayload`。
  - 对阈值、超时时间、收藏数量、枚举字段设置 `ge/le`、枚举和默认值。
  - 将服务层转换错误统一包装为 `AppError(ErrorCode.INVALID_PARAMS)`。
  - 增加异常输入、边界值和版本冲突测试，避免只通过 controller fake service 验证。
- 参考修复方向或示例代码：
  ```python
  class FunctionSettingsPayload(ApiSchema):
      low_battery_threshold: float = Field(default=20, ge=0, le=100)
      offline_threshold_seconds: int = Field(default=300, ge=30, le=86400)
      favorite_limit: int = Field(default=8, ge=1, le=50)

  class FavoritePayload(ApiSchema):
      device_id: str = Field(min_length=1)
      selected: bool = True
      favorite_order: int | None = Field(default=None, ge=0)
  ```
- 优先级建议：第一阶段必须修复。

### [P2] Home Assistant 连接 URL 未限制，存在 SSRF/内网探测风险

- 位置：`backend/src/modules/system_connections/services/SystemConnectionService.py:212`，涉及函数/类：`SystemConnectionService.save_home_assistant`
- 位置：`backend/src/modules/system_connections/services/SystemConnectionService.py:247`，涉及函数/类：`SystemConnectionService.test_home_assistant`
- 位置：`backend/src/infrastructure/ha/impl/HomeAssistantConnectionGateway.py:178`，涉及函数/类：`HomeAssistantConnectionGateway.test_connection`
- 问题描述：用户传入或候选配置中的 `base_url` 被直接拼接为 `${base_url}/api/` 并由后端请求。当前没有看到 scheme 白名单、host/IP 白名单、私有地址限制、DNS rebinding 防护、端口限制或禁止访问 metadata/local file 等边界。
- 影响范围：系统连接测试、保存配置后的 HA API 调用、同步和设备控制。
- 风险后果：具备管理 PIN 的操作者或被劫持的前端可让后端访问任意内网地址，造成内网探测、访问本机管理端口、打到云 metadata 服务等风险。虽然当前业务面向家庭内网，但风险仍应收敛。
- 修复建议：
  - 只允许 `http`/`https`，拒绝空 host、userinfo、非标准 scheme。
  - 对部署形态做 allowlist，例如只允许 `homeassistant`、配置指定网段或用户明确批准的局域网 IP。
  - 禁止访问 loopback、link-local、metadata IP、Docker socket 代理、私有管理网段，或至少将其纳入显式配置。
  - 记录外部连接测试审计日志，并避免把底层异常完整回显给用户。
- 参考修复方向或示例代码：
  ```python
  parsed = urlparse(base_url)
  if parsed.scheme not in {"http", "https"} or not parsed.hostname:
      raise AppError(ErrorCode.INVALID_PARAMS, "invalid Home Assistant URL")
  if is_forbidden_target(parsed.hostname):
      raise AppError(ErrorCode.FORBIDDEN, "Home Assistant URL is not allowed")
  ```
- 优先级建议：第二阶段短期修复；若部署到不可信网络，应提前到第一阶段。

### [P2] Bootstrap token 长期保存在 localStorage，扩大 XSS 后的横向影响

- 位置：`frontend/src/auth/bootstrapToken.ts:14`，涉及函数/类：`readStoredBootstrapToken`
- 位置：`frontend/src/auth/bootstrapToken.ts:31`，涉及函数/类：`setBootstrapToken`
- 位置：`frontend/src/system/AppBootstrap.tsx:98`，涉及函数/类：`finishActivation`
- 问题描述：前端在激活成功后把 bootstrap token 写入 `localStorage`，每次启动再用它换取新的 access token。localStorage 对所有同源脚本可读，且 token 默认有效期较长。
- 影响范围：终端激活、页面刷新后的自动登录、E2E 激活流程。
- 风险后果：一旦前端出现 XSS、恶意浏览器扩展或同源静态资源被污染，攻击者可直接读取长期 bootstrap token，并在有效期内反复换取 access token。当前虽然 CSP 较严格，但这类凭据仍不宜长期暴露给 JS。
- 修复建议：
  - bootstrap token 仅用于一次激活，换取服务端管理的 HttpOnly refresh/session cookie。
  - 如必须本地保存，使用更短 TTL、绑定设备指纹/终端状态，并在服务端支持一键撤销。
  - 将 access token 续期改为服务端 HttpOnly cookie 或 refresh token rotation。
- 参考修复方向或示例代码：
  ```ts
  // 激活成功后不再保存 bootstrap token
  await activateSessionWithBootstrapToken(token);
  setBootstrapToken(null);
  ```
- 优先级建议：第二阶段短期修复；若存在公网入口，应提前到第一阶段。

### [P2] 设备控制请求落库与 HA 调用分离，崩溃/并发时可能产生状态不一致

- 位置：`backend/src/modules/device_control/services/command/DeviceControlCommandService.py:173`，涉及函数/类：`DeviceControlCommandService.accept`
- 位置：`backend/src/modules/device_control/services/command/DeviceControlCommandService.py:210`，涉及函数/类：`DeviceControlCommandService.accept`
- 位置：`backend/src/modules/device_control/services/command/DeviceControlCommandService.py:263`，涉及函数/类：`DeviceControlCommandService.accept`
- 问题描述：服务先在事务中插入 accepted 控制请求，然后在事务外调用 HA，最后再用另一个事务标记 succeeded/failed。若进程在 HA 调用成功后、状态更新前崩溃，数据库会保留 accepted/pending 状态但真实设备可能已执行。并发使用同一 request_id 时，也依赖数据库唯一约束兜底，当前代码未显式捕获插入冲突并转换为幂等结果。
- 影响范围：`POST /api/v1/device-controls` 及结果查询、实时事件。
- 风险后果：用户可能看到控制请求长时间 pending 或失败状态与真实设备不一致；客户端重试可能触发重复控制或 500。
- 修复建议：
  - 引入明确的 outbox/worker 状态机：请求入库后异步提交 HA，失败可重试，状态转移幂等。
  - 捕获唯一约束冲突，重新读取 request_id 并按幂等语义返回。
  - 为 HA 调用成功但状态更新失败增加补偿任务或 reconcile job。
- 参考修复方向或示例代码：
  ```python
  try:
      inserted = await insert_accepted(...)
  except UniqueViolation:
      return await resolve_existing_idempotent_request(...)
  ```
- 优先级建议：第二阶段短期修复。

### [P2] 后端本地质量命令依赖不完整，Python 版本与 README/CI 不一致

- 位置：`backend/pyproject.toml:5`，涉及配置：Python `>=3.12`
- 位置：`README.md` 验证命令，涉及配置：`uv run --project backend`
- 位置：`Makefile:3`，涉及配置：`BACKEND_PYTHON`
- 问题描述：本次审阅环境只有 Python 3.11/3.10/2.7/Anaconda39，没有 `uv`，也没有 `pip_audit`/`alembic`。因此 README 推荐的 `uv run` 不能执行，`python -m pytest backend/tests -q` 在当前环境失败 1 个迁移测试。Makefile 使用 Unix shell 判断语法，在 Windows PowerShell 默认环境不友好。
- 影响范围：本地开发、审阅复现、Windows 开发者体验。
- 风险后果：开发者可能以不一致 Python/依赖环境运行测试，得到与 CI 不同的结果；新成员 onboarding 成本上升。
- 修复建议：
  - 在 README 增加 `uv` 安装说明、Python 3.12 安装要求和 Windows PowerShell 等价命令。
  - 提供 `scripts/check_backend.ps1` 或 `tox/nox`，统一创建隔离环境并安装 `requirements-dev.lock`。
  - 在本地命令失败时明确提示“依赖未安装”而不是让迁移测试以 ImportError 失败。
- 参考修复方向或示例代码：
  ```powershell
  py -3.12 -m venv backend/.venv
  backend/.venv/Scripts/python -m pip install -r backend/requirements-dev.lock
  backend/.venv/Scripts/python -m pytest backend/tests -q
  ```
- 优先级建议：第二阶段短期修复。

### [P3] 前端 API client 将合法 falsy data 当成失败

- 位置：`frontend/src/api/httpClient.ts:52`，涉及函数/类：`apiRequest`
- 问题描述：当前判断为 `!response.ok || !envelope.success || !envelope.data`。如果后续接口返回 `false`、`0`、空字符串或 `null` 作为合法数据，会被误判为失败。当前多数接口返回对象，因此短期风险较低。
- 影响范围：所有前端 API 调用。
- 风险后果：未来新增布尔/数字型接口时会出现前端误报失败，且问题不容易从后端日志发现。
- 修复建议：改为检查 `envelope.data === undefined` 或按 `success` 字段判断，不以 truthiness 判断合法数据。
- 参考修复方向或示例代码：
  ```ts
  if (!response.ok || !envelope.success) {
    throw new ApiError(envelope.error ?? fallbackError);
  }
  return envelope.data;
  ```
- 优先级建议：第三阶段中长期治理。

### [P3] 后端静态检查范围偏窄，缺少类型检查与复杂度约束

- 位置：`backend/pyproject.toml:47`，涉及配置：`[tool.ruff.lint]`
- 问题描述：ruff 只启用 `E4/E7/E9/F`，主要覆盖语法错误和未定义名称。后端没有 mypy/pyright 配置，也没有复杂度、bugbear、安全规则或 import 规则。
- 影响范围：后端所有 Python 代码。
- 风险后果：大量 `dict[str, Any]`、可空字段、协议/仓储返回值不匹配等问题只能靠运行时测试发现。随着模块继续增长，回归风险会上升。
- 修复建议：
  - 分阶段引入 `mypy` 或 `pyright`，先覆盖 `src/modules` 和 `src/shared`。
  - 扩展 ruff 规则到 `B`、`I`、`UP`、`SIM`、`C4` 等，先以 warning/单目录方式试运行。
  - 对 controller/service/repository 边界新增类型契约测试。
- 参考修复方向或示例代码：
  ```toml
  [tool.ruff.lint]
  select = ["E4", "E7", "E9", "F", "B", "I", "UP"]
  ```
- 优先级建议：第三阶段中长期治理。

### [P3] 可观测性已起步，但缺少生产级指标/告警闭环

- 位置：`backend/src/app/observability_middleware.py:24`，涉及函数/类：`register_observability_middleware`
- 位置：`backend/src/app/health_routes.py:89`，涉及函数/类：`observabilityz`
- 问题描述：项目已有 trace_id、结构化 HTTP/WS 日志和内存计数器，但指标仅通过 `/observabilityz` 暴露快照，未看到 Prometheus/OpenTelemetry 接入、告警规则、慢请求阈值、业务失败率指标或外部系统调用指标。
- 影响范围：线上故障定位、HA/SGCC 依赖异常、控制请求失败、WebSocket 断连。
- 风险后果：生产问题可被日志定位，但缺少主动告警和长期趋势分析，较难发现慢性退化。
- 修复建议：
  - 增加 Prometheus/OpenTelemetry 指标：请求延迟直方图、HA 调用状态、控制请求成功率、WS 连接数、outbox backlog。
  - 为关键错误码和外部依赖失败配置告警。
  - 对设备控制、备份恢复、终端 token 重置补充审计日志。
- 参考修复方向或示例代码：将 `ObservabilityMetrics` 快照迁移或桥接到标准 metrics endpoint。
- 优先级建议：第三阶段中长期治理。

## 5. 分项审阅详情

### 5.1 功能正确性与稳定性

- 当前表现：核心业务路径覆盖较完整，后端有统一异常处理，设备控制有幂等语义尝试，设置/编辑/备份/实时事件均有服务层。
- 主要问题：设置保存对 malformed payload 不稳健；设备控制在 HA 调用和状态更新之间存在崩溃窗口；能耗自动刷新串行处理所有绑定账户，失败恢复依赖日志。
- 扣分理由：核心写路径仍有 500 与状态不一致风险。
- 改进建议：优先修复设置请求模型和设备控制状态机；为并发 request_id、HA 调用成功后落库失败、设置非法字段补充测试。

### 5.2 架构设计与模块边界

- 当前表现：模块化结构清楚，controller/service/repository/infrastructure 边界基本成立，仓储抽象便于单元测试。
- 主要问题：`container_getters` 和 DI 手写 getter 较多，长期维护会有重复；部分服务直接承担外部 URL 安全、加密、连接测试、业务状态更新等多重职责。
- 扣分理由：整体架构健康，但控制面和外部依赖适配层边界还可收紧。
- 改进建议：将外部连接配置验证独立成 policy/validator；将 token/session 状态独立为认证中间层或认证仓储；为 DI 绑定增加自动化边界测试。

### 5.3 代码可读性与可维护性

- 当前表现：多数文件命名清晰，服务类职责可理解，测试命名较直观。
- 主要问题：核心 payload 仍大量使用 `dict[str, Any]`；部分服务函数较长，如备份恢复和系统连接服务；后端缺少类型检查。
- 扣分理由：复杂业务逐渐增多后，隐式 JSON 字段会成为维护风险。
- 改进建议：将 Settings、HA auth payload、control payload 逐步模型化；为长服务函数拆出纯函数和 validator；引入类型检查。

### 5.4 安全性与合规风险

- 当前表现：非本地环境会校验强 secret，secret scan 已进入 CI，CSP/安全响应头/限流/HttpOnly PIN cookie 有基础。
- 主要问题：access token 不可撤销；bootstrap token 保存在 localStorage；HA base_url 未做 SSRF 限制；`.env` 本地存在真实 secret，虽然被 `.gitignore` 排除，但仍需注意本机泄露风险。
- 扣分理由：认证令牌生命周期和外部 URL 边界是当前最大安全短板。
- 改进建议：修复 token 撤销、bootstrap token 存储和 URL allowlist；扩大 secret scan 到 pre-commit；避免在报告、日志或文档中输出真实 `.env` 值。

### 5.5 测试质量与覆盖度

- 当前表现：后端约 50 个测试文件，前端 40 个 test files/180 个测试通过，集成测试覆盖主要路由，CI 包含 backend/frontend/contracts/e2e-smoke。
- 主要问题：设置路由测试使用 fake service，未覆盖真实 `SettingsSaveService` 的非法输入；缺少 token 撤销、SSRF URL、防并发幂等、设备控制崩溃恢复测试；本次未启动完整 Compose 跑 E2E。
- 扣分理由：覆盖广度好，但核心风险点的负向测试不足。
- 改进建议：补充安全和异常路径测试；增加 property/boundary tests；将 E2E smoke 与本地脚本做成一键可复现。

### 5.6 性能与资源使用

- 当前表现：上传有大小限制，Docker Compose 配置了资源限制，查询多数采用参数化 SQL，前端 build 产物体积可接受。
- 主要问题：能耗自动刷新串行遍历账户；WebSocket resume 只看最近 100 条事件，极端高频变更会进入 snapshot fallback；前端主 bundle gzip 约 103.76 kB，后续增长需关注。
- 扣分理由：当前没有明显瓶颈，但规模化场景还缺少容量策略。
- 改进建议：为 outbox backlog、自动刷新耗时和 HA 调用延迟建立指标；必要时引入批处理/并发上限；前端继续拆分设置页大 chunk。

### 5.7 工程化与开发体验

- 当前表现：CI 质量门较完整，Dockerfile 使用 digest pin，README 提供验证命令，前端 npm 脚本清晰。
- 主要问题：本机没有 `uv` 和 Python 3.12，README 命令无法复现；Makefile 偏 Unix；后端依赖未安装时测试失败信息不够友好。
- 扣分理由：CI 好，但跨平台本地体验有断点。
- 改进建议：补充 Windows PowerShell 脚本和 devcontainer/nox/tox；README 增加安装 `uv` 与 Python 3.12 的步骤；提供一键 `check.ps1`。

### 5.8 文档与注释质量

- 当前表现：README、部署说明、PRD、API、DDL、威胁模型、测试验收文档较丰富。
- 主要问题：文档对 token 生命周期、bootstrap token 存储安全、URL allowlist、生成命令副作用说明不够突出。
- 扣分理由：文档完整度高，但关键安全运行约束需要更明确。
- 改进建议：在部署文档增加“生产安全基线”；在 README 标注哪些命令会修改生成文件；记录 token 撤销/轮换策略。

### 5.9 日志、监控与可观测性

- 当前表现：HTTP 中间件写 trace_id、耗时、状态码、auth_mode、home_id/terminal_id；WebSocket 记录连接、拒绝、ack、resume；`/readyz` 检查 DB/Redis。
- 主要问题：指标为进程内快照，缺少标准采集和告警；外部依赖调用指标不系统；控制请求和备份恢复的关键审计可继续强化。
- 扣分理由：定位能力已有基础，但生产告警闭环不足。
- 改进建议：接入 Prometheus/OpenTelemetry；定义 SLO 和告警；为 HA/SGCC/DB/Redis 失败增加结构化错误维度。

## 6. 测试与命令执行结果

| 命令 | 是否成功 | 结果摘要 | 失败原因 |
|---|---|---|---|
| `python scripts/check_plaintext_secrets.py` | 成功 | 无输出，tracked files 未发现明文 secret。 | 无 |
| `uv run --project backend --extra dev python -m ruff check backend/src backend/tests scripts/check_plaintext_secrets.py` | 失败 | 命令未执行。 | 本机未安装 `uv`。 |
| `python -m ruff check backend/src backend/tests scripts/check_plaintext_secrets.py` | 成功 | `All checks passed!` | 无 |
| `python -m pip_audit --requirement backend/requirements.lock --strict` | 失败 | 命令未执行。 | 当前 Python 环境未安装 `pip_audit`，且本机无项目虚拟环境。 |
| `python -m pytest backend/tests -q` | 失败 | 229 passed，1 failed。 | `test_initial_schema_statements_include_core_schema` 导入迁移文件时 `from alembic import op` 失败；当前环境未安装 Alembic。 |
| `python -m pytest backend/tests/unit -q` | 失败 | 194 passed，1 failed。 | 同上，Alembic 缺失。 |
| `python -m pytest backend/tests/integration -q` | 成功 | 35 passed。 | 无 |
| `npm run lint` | 成功 | ESLint 通过。 | npm 输出未知 user config `config`/`python` 警告。 |
| `npm run format:check` | 成功 | Prettier 检查通过。 | npm 输出同上警告。 |
| `npm run typecheck` | 成功 | TypeScript build mode 检查通过。 | npm 输出同上警告。 |
| `npm test` | 成功 | 40 个 test files、180 个测试通过，耗时约 84.52s。 | npm 输出同上警告。 |
| `npm run build` | 成功 | Vite production build 通过，主入口 gzip 约 103.76 kB。 | npm 输出同上警告。 |
| `docker compose config --quiet` | 成功 | 使用临时环境变量提供三个必填 secret 后配置校验通过。 | 无 |
| `npm audit --audit-level=moderate --omit=dev` | 成功 | production dependencies 未发现漏洞。 | npm 输出同上警告。 |

未执行或未完整执行：

- `npm run test:e2e`：需要启动完整服务栈/前端基址，本次未额外启动 Compose 执行 E2E，以避免长时间占用本地服务端口。
- `npm run generate:api-types`：该命令会更新生成文件，本次审阅遵循“不修改业务代码/生成代码”的要求，未执行。
- `pip-audit` 后端依赖审计：本机无 `uv` 和 `pip_audit`，未安装项目虚拟环境，因此无法得到后端依赖漏洞结论。

## 7. 优先修复路线图

### 第一阶段：必须立即修复

- 修复 access token 不可撤销问题：缩短 TTL，引入 jti/session version 校验，并在终端重置/解绑时撤销。
- 修复 `PUT /api/v1/settings` 输入校验：为 page/function/favorites 建立 Pydantic 模型，所有非法输入返回 400/422。
- 补充上述两项的回归测试、异常路径测试和安全测试。

### 第二阶段：短期优化

- 为 Home Assistant `base_url` 增加 scheme/host/IP/端口 allowlist 或 denylist，补充 SSRF 测试。
- 改造设备控制状态机，处理 HA 调用成功但落库失败、并发 request_id 冲突和补偿恢复。
- 优化本地后端开发脚本：补充 Python 3.12 + uv 安装说明、Windows PowerShell 检查脚本和依赖缺失提示。
- 评估 bootstrap token 持久化策略，改为 HttpOnly refresh/session 或一次性激活后撤销。

### 第三阶段：中长期治理

- 引入后端类型检查和更完整的 ruff 规则集。
- 将关键 JSON payload 从 `dict[str, Any]` 收敛为领域模型。
- 接入 Prometheus/OpenTelemetry，增加 HA/SGCC/设备控制/outbox 指标和告警。
- 为 E2E、契约生成、依赖审计提供本地一键命令，减少 CI 与本地差异。
- 持续拆分前端大 chunk，并监控首屏和 kiosk 设备性能。

## 8. 最终建议

- 是否建议当前版本上线/合并：不建议作为生产版本无条件上线；建议先修复 P1 问题后再进入生产或正式合并门槛。若仅用于受控内网试运行，可在限制入口、缩短 token TTL、开启日志监控的前提下灰度。
- 如果不建议，需要先完成哪些事项：
  - 完成 access token 撤销/终端状态校验。
  - 完成设置保存接口结构化校验与异常路径测试。
  - 对 HA URL 调用边界和 bootstrap token 持久化策略做安全收口。
- 如果建议，有哪些风险需要在后续迭代中跟踪：
  - 设备控制状态与真实 HA 执行结果的一致性。
  - WebSocket outbox backlog 与 resume fallback 比例。
  - SGCC/HA 外部依赖失败率、延迟和错误回显。
- 下一步最推荐执行的 3 个行动：
  - 先做认证会话治理：jti/session version、终端重置撤销、短 TTL。
  - 为 SettingsSaveService 建模并补测试，消除 malformed payload 的 500。
  - 加入 HA base_url 安全校验和审计日志，避免后端成为内网请求代理。
