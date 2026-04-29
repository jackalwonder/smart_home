# 代码审阅整改收口总结

更新时间：2026-04-29

## 1. 收口结论

三批代码审阅整改已经合并到 `main`：

- 第一批安全阻塞项：PR #64，已合并，merge commit `5b22c6e`。
- 第二批运行保护项：PR #66，已合并，merge commit `32af683`。
- 第三批认证与开发保护项：PR #67，已合并，merge commit `c44e8af`。

当前结论：

- P0、P1、P2 审阅问题已经完成代码侧整改，并通过本地验证和 GitHub CI。
- 剩余工作主要是 P3 结构性债务和上线运维动作，例如 DI/CSS 拆分、真实凭据轮换、生产 HSTS 入口落地和资源/限流调参。
- 当前可以把三批整改视为“安全整改主线已合入 main”，但仍不应把运维侧凭据轮换、TLS/HSTS 入口配置和生产资源基线视为已经自动完成。

## 2. 已完成问题清单

| 编号 | 状态 | 完成内容 | 主要文件 |
|---|---|---|---|
| P0-1 | 已完成 | 容器启动不再无条件执行开发数据脚本；开发种子只允许在 local/dev/development/test 且显式开启时执行；开发种子不再覆盖已有 PIN 配置。 | `backend/docker-entrypoint.sh`、`backend/scripts/bootstrap_dev_data.py`、`backend/tests/unit/test_bootstrap_dev_data_safety.py` |
| P0-2 | 代码侧已完成 | 移除仓库内明文 SGCC 环境文件；补 `.env.example`、deploy README、明文凭据扫描和 CI Secret Scan。 | `.github/workflows/ci.yml`、`.gitignore`、`scripts/check_plaintext_secrets.py`、`backend/tests/unit/test_plaintext_secret_scan.py`、`deploy/*` |
| P1-1 | 已完成 | 升级并锁定 Python 依赖，修复 `cryptography` 已知 CVE；引入 `requirements.lock` / `requirements-dev.lock` / `uv.lock`；CI 增加 `pip-audit --strict`。 | `backend/pyproject.toml`、`backend/requirements.lock`、`backend/requirements-dev.lock`、`backend/uv.lock`、`.github/workflows/ci.yml` |
| P1-2 | 已完成 | 引入 Redis 请求级限流；覆盖登录、PIN、bootstrap、pairing、上传、文件下载，并保留全局兜底；统一返回 429 和 `Retry-After`。 | `backend/src/app/rate_limit_middleware.py`、`backend/src/main.py`、`backend/src/shared/config/Settings.py`、`backend/tests/unit/test_rate_limit_middleware.py` |
| P1-3 | 已完成 | 上传不再只信任 `Content-Type`；增加 PNG/JPEG/GIF/WebP 魔数识别；拒绝 SVG；下载响应增加 `X-Content-Type-Options: nosniff`。 | `backend/src/modules/page_assets/services/FloorplanAssetService.py`、`backend/src/modules/page_assets/controllers/PageAssetsController.py`、`backend/tests/integration/test_assets_backup_routes.py` |
| P1-4 | 已完成 | 统一 `FRONTEND_PORT=5173`、`PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173`、README 和 CI 默认值，避免本地和 E2E 端口漂移。 | `.github/workflows/ci.yml`、`.env.example`、`README.md`、`frontend/e2e/support/smokeHelpers.ts` |
| P2-1 | 已完成 | 非本地环境 500 响应不再暴露 `exception_type`；本地环境保留调试信息；服务端日志保留 trace id 和请求路径。 | `backend/src/app/exception_handlers.py`、`backend/tests/integration/test_supporting_routes.py` |
| P2-2 | 已完成 | 上传读取改为分块读取并在超过阈值后中止；保留 floorplan 8 MiB、hotspot icon 512 KiB 上限。 | `backend/src/modules/page_assets/controllers/PageAssetsController.py`、`backend/src/modules/page_assets/services/FloorplanAssetService.py` |
| P2-3 | 已完成 | Vite 本地开发增加 `/api` 和 `/ws` proxy，默认指向 `VITE_BACKEND_PROXY_TARGET=http://localhost:8000`；README 同步说明。 | `frontend/vite.config.ts`、`.env.example`、`README.md` |
| P2-4 | 已完成代码侧收紧 | Nginx 从 `Content-Security-Policy-Report-Only` 切到 enforce `Content-Security-Policy`；策略覆盖同源 API/WebSocket、`data:` 二维码图片和 `blob:` 运行时图片；HSTS 继续明确放到实际 TLS 终止入口并补示例。 | `frontend/nginx.conf`、`deploy/README.md`、`README.md`、`backend/tests/unit/test_frontend_nginx_security_headers.py` |
| P2-5 | 已完成 | Compose 为 frontend/backend/Home Assistant/SGCC/Postgres/Redis 增加可配置 `mem_limit` 和 `cpus` 默认值。 | `docker-compose.yml`、`.env.example`、`deploy/README.md` |
| P2-6 | 已完成 | PIN 存储迁移到 Argon2id PHC 慢哈希；兼容旧 `sha256(pin:salt)`；旧哈希在成功验证后自动回写升级，失败验证不会升级。 | `backend/src/modules/auth/services/PinHashing.py`、`backend/src/modules/auth/services/command/PinVerificationService.py`、`backend/src/repositories/base/auth/HomeAuthConfigRepository.py`、`backend/tests/unit/test_pin_hashing.py` |
| P2-7 | 已完成 | 删除 ruff F401 未使用导入；后端 ruff 全量检查通过。 | `backend/src/app/catalog_di.py`、`backend/src/main.py` |
| P3-1 | 已完成 | 后端 Python 依赖锁文件已引入；外部基础镜像使用 digest pin；README 补充镜像升级策略。 | `backend/requirements.lock`、`backend/requirements-dev.lock`、`backend/uv.lock`、`docker-compose.yml`、`backend/Dockerfile`、`frontend/Dockerfile`、`services/sgcc_electricity_direct_qrcode/Dockerfile` |
| P3-2 | 已完成 | 明确 deploy 模板与运行态数据边界；真实 secret、HA 数据库、SGCC 缓存/二维码继续忽略。 | `.gitignore`、`deploy/README.md`、`deploy/homeassistant/README.md`、`deploy/sgcc_electricity/README.md`、`deploy/sgcc_electricity/.env.example` |
| P3-5 | 已完成 | Alembic 初始迁移改为自包含 SQL；移除 backend 生产镜像对额外 DDL SQL COPY 的依赖；删除 backend 根目录运行时 DDL 文件；明文凭据扫描兼容本地已删除但未暂存的跟踪文件。 | `backend/alembic/versions/20260414_0001_initial_schema.py`、`backend/Dockerfile`、`backend/tests/unit/test_initial_schema_migration.py`、`scripts/check_plaintext_secrets.py` |
| P3-6 | 已完成 | SGCC sidecar 基础镜像改为 digest pin；补丁脚本增加 marker 缺失失败和补丁后断言；新增补丁 helper 单测。 | `services/sgcc_electricity_direct_qrcode/Dockerfile`、`services/sgcc_electricity_direct_qrcode/patch_direct_qrcode.py`、`backend/tests/unit/test_sgcc_direct_qrcode_patch.py` |

## 3. 部分完成问题清单

| 编号 | 当前进展 | 未完成内容 | 建议处理方式 |
|---|---|---|---|
| P3-3 | 已增加架构边界测试；`repository_di.py` 已拆成按 domain 聚合安装的 repository modules，并新增 DI 解析回归测试。 | `container.py` 仍保留兼容 controller 的集中 getter facade。 | 后续可按 controller 依赖把 facade 拆成 domain getter 模块，再由 `container.py` 显式 re-export。 |
| P3-4 | 已新增样式模块边界说明；`layout.css` 中 terminal activation 页面样式已拆到 `terminal.css`，并保持导入顺序。 | `home.css`、`settings.css` 仍是大文件。 | 后续继续按页面/组件 ownership 拆分，配合 Playwright 截图或 E2E 验证。 |

## 4. 未完成问题清单及原因

| 编号 | 问题 | 未完成原因 | 建议后续动作 |
|---|---|---|---|
| OPS-1 | 已泄露或曾经入库的真实凭据需要轮换 | 代码只能防止再次提交和扫描，不能替运维轮换外部系统凭据。 | 轮换 SGCC、Home Assistant token、部署环境 `.env` 中的应用 secret，并记录轮换完成时间。 |
| OPS-2 | 生产限流阈值和资源限制仍需按真实负载校准 | 当前值是保守默认值，尚未基于生产流量和机器规格调参。 | 上线前压测登录/PIN/上传/文件下载路径；根据 429、Redis 延迟、CPU/内存曲线调整阈值。 |
| OPS-3 | HSTS 需要在真实 HTTPS 入口落地 | 本仓库 frontend 容器是纯 HTTP 内部入口，不能代表 CDN/Ingress/宿主反代的 TLS 终止配置。 | 在真实 HTTPS 入口确认强制 HTTPS、证书和子域策略后配置 `Strict-Transport-Security`，并完成浏览器验证。 |

## 5. 修改过的主要文件

### 第一批安全阻塞项

- `.github/workflows/ci.yml`
- `Makefile`
- `README.md`
- `backend/Dockerfile`
- `backend/openapi.json`
- `backend/pyproject.toml`
- `backend/requirements.lock`
- `backend/requirements-dev.lock`
- `backend/uv.lock`
- `backend/src/modules/page_assets/controllers/PageAssetsController.py`
- `backend/src/modules/page_assets/services/FloorplanAssetService.py`
- `backend/tests/integration/test_assets_backup_routes.py`
- `backend/tests/unit/test_phase4_contract_services.py`
- `frontend/src/api/types.generated.ts`

### 第二批运行保护项

- `.env.example`
- `.github/workflows/ci.yml`
- `README.md`
- `backend/src/app/exception_handlers.py`
- `backend/src/app/rate_limit_middleware.py`
- `backend/src/main.py`
- `backend/src/shared/config/Settings.py`
- `backend/src/shared/errors/ErrorCode.py`
- `backend/tests/unit/test_rate_limit_middleware.py`
- `deploy/README.md`
- `docker-compose.yml`
- `frontend/e2e/support/smokeHelpers.ts`
- `frontend/nginx.conf`

### 第三批认证与开发保护项

- `.env.example`
- `README.md`
- `backend/scripts/bootstrap_dev_data.py`
- `backend/src/infrastructure/db/repositories/base/auth/HomeAuthConfigRepositoryImpl.py`
- `backend/src/modules/auth/services/PinHashing.py`
- `backend/src/modules/auth/services/command/PinVerificationService.py`
- `backend/src/repositories/base/auth/HomeAuthConfigRepository.py`
- `backend/tests/unit/test_bootstrap_dev_data_safety.py`
- `backend/tests/unit/test_pin_hashing.py`
- `frontend/vite.config.ts`

### 第四批生产镜像和迁移边界

- `backend/Dockerfile`
- `backend/alembic/versions/20260414_0001_initial_schema.py`
- `backend/tests/unit/test_plaintext_secret_scan.py`
- `backend/tests/unit/test_initial_schema_migration.py`
- `scripts/check_plaintext_secrets.py`

### 第五批 CSP/HSTS 上线收紧

- `README.md`
- `deploy/README.md`
- `frontend/nginx.conf`
- `backend/tests/unit/test_frontend_nginx_security_headers.py`

### 第六批结构性债务拆分

- `backend/src/app/repository_di.py`
- `backend/src/app/repository_modules/*`
- `backend/tests/unit/test_repository_di.py`
- `frontend/src/main.tsx`
- `frontend/src/styles/README.md`
- `frontend/src/styles/layout.css`
- `frontend/src/styles/terminal.css`

### 第一阶段已存在的治理文件

- `.gitignore`
- `backend/docker-entrypoint.sh`
- `backend/tests/unit/test_architecture_boundaries.py`
- `backend/tests/unit/test_bootstrap_dev_data_safety.py`
- `backend/tests/unit/test_plaintext_secret_scan.py`
- `backend/tests/unit/test_sgcc_direct_qrcode_patch.py`
- `deploy/homeassistant/README.md`
- `deploy/sgcc_electricity/.env.example`
- `deploy/sgcc_electricity/README.md`
- `frontend/src/styles/README.md`
- `scripts/check_plaintext_secrets.py`
- `services/sgcc_electricity_direct_qrcode/Dockerfile`
- `services/sgcc_electricity_direct_qrcode/patch_direct_qrcode.py`

## 6. 测试和验证结果

### 本地验证

| 命令 | 结果 |
|---|---|
| `uv run --project backend --extra dev python -m ruff check backend/src backend/tests scripts/check_plaintext_secrets.py` | 通过 |
| `uv run --project backend --extra dev python -m pytest backend/tests -q` | 通过，`229 passed` |
| `uv run --project backend --extra dev python -m pytest backend/tests/unit/test_initial_schema_migration.py -q` | 通过，`2 passed` |
| `uv run --project backend --extra dev python -m pytest backend/tests/unit/test_frontend_nginx_security_headers.py -q` | 通过，`2 passed` |
| `DATABASE_URL=... uv run --extra dev alembic upgrade head` | 通过，临时空 PostgreSQL 容器验证 |
| `docker build -t smart-home-backend:p3-migration-test backend` | 通过 |
| `docker compose build backend` | 通过 |
| 临时 Postgres/Redis/backend 容器 `/readyz` 验证 | 通过 |
| `docker build -t smart-home-frontend:csp-enforce-test frontend` | 通过 |
| 临时 frontend 容器 CSP/HSTS 响应头验证 | 通过，存在 enforce CSP，无 report-only CSP，无 HTTP HSTS |
| `docker compose build frontend` | 通过 |
| `uv run --project backend --extra dev python -m pip_audit --requirement backend/requirements.lock --strict` | 通过，无已知漏洞 |
| `uv run --project backend --extra dev python scripts/check_plaintext_secrets.py` | 通过 |
| `CONNECTION_ENCRYPTION_SECRET=... ACCESS_TOKEN_SECRET=... BOOTSTRAP_TOKEN_SECRET=... docker compose config --quiet` | 通过 |
| `npm run format:check` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过 |
| `npm test` | 通过，`40` 个测试文件、`180` 个测试通过 |
| `npm run build` | 通过 |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:<temp> npm run test:e2e` | 通过，临时新版 frontend 容器验证，`20 passed` |
| `docker compose build frontend` | 通过 |
| `git diff --check` | 通过 |

### GitHub CI

| PR | 状态 | 通过检查 |
|---|---|---|
| #64 | 已合并 | Backend/Frontend/Secret/Contract/E2E 相关检查通过 |
| #66 | 已合并 | `Backend Tests`、`Contract Generation`、`Frontend Build`、`Secret Scan`、`E2E Smoke` 全部通过 |
| #67 | 已合并 | `Backend Tests`、`Contract Generation`、`Frontend Build`、`Secret Scan`、`E2E Smoke` 全部通过 |

## 7. 无关改动、格式化和文档检查

- 无关改动：三批 PR 的业务代码变更均能对应整改计划；未发现大规模无关重构或文件重命名污染。
- 格式化污染：`git diff --check` 通过。
- README/文档：已更新依赖审计、上传安全、限流、端口、Vite proxy、PIN 哈希迁移、运行资源、CSP enforce、样式模块边界和部署注意事项。
- CHANGELOG：仓库未发现 `CHANGELOG*` 文件，未更新。
- 迁移说明：第三批 PIN 迁移采用“成功验证后回写升级”，无需新增数据库迁移；第四批将初始迁移改为自包含 SQL，未新增迁移 revision，未改变业务 schema。

## 8. 剩余风险

- 真实泄露凭据仍需要运维侧轮换；代码侧已经增加防再次提交和 CI 扫描，但不能撤销外部凭据。
- Redis 限流当前选择 fail-open：Redis 异常时记录 warning 并放行请求，避免可用性故障；如果生产更重视强安全，可评估 fail-closed 或局部 fail-closed。
- CSP 已切到 enforce，并通过临时新版 frontend 容器 E2E；后续若引入外部资源来源，需要同步收紧或扩展策略。
- HSTS 必须在真实 HTTPS/TLS 终止入口配置；当前 Nginx 文件只服务容器内 HTTP，不应误加 HSTS。
- Docker image digest pin 提高可复现性，但也要求建立定期升级流程，否则安全修复不会自动进入。

## 9. 当前做到什么程度

当前 `main` 已经从“阶段性整改”进入“安全主线基本收口”状态：

- 依赖漏洞、上传安全、限流、异常信息泄露、端口漂移、开发数据保护、PIN 快速哈希等高风险和中风险项已经落到代码、测试和 CI。
- 第六批已启动结构性拆分：repository DI 已按 domain 拆分，terminal activation 样式已从 layout 样式中独立。
- 本地验证与 PR CI 都覆盖了后端单测/集成测试、前端 lint/typecheck/test/build、契约生成、secret scan、pip-audit 和 E2E smoke。
- 剩余问题不再是明显的安全阻塞项，更多是生产上线前的运维确认和中长期结构化维护。

## 10. 下一步修改计划

### 第六批：结构性债务拆分

目标：降低后续维护成本，不把结构性改造混入安全修复。当前已完成 repository DI domain 拆分和 terminal activation CSS 拆分，后续继续做更小粒度的无行为改动。

建议步骤：

1. DI 拆分：继续把 `container.py` 从集中 getter facade 拆为 domain getter 模块，并保持 `container.py` 显式 re-export 兼容现有 controller import。
2. CSS 拆分：继续拆 `home.css`、`settings.css` 中低风险页面级样式，再拆共享 layout；每次保留选择器顺序说明并跑截图检查。
3. 每个结构性 PR 控制 diff，要求无行为改动；主要验证 `backend tests`、`npm test`、`npm run build` 和 E2E smoke。

### 运维并行动作

目标：把代码整改转换为真实生产安全状态。

建议步骤：

1. 轮换所有曾经暴露或共享过的 SGCC、Home Assistant token、应用 secret。
2. 按生产机器规格调整 Compose 或平台资源限制。
3. 根据实际流量压测并校准 Redis 限流阈值。
4. 建立 digest pin 和 Python lock 的定期更新流程，例如每月依赖审计 PR。
