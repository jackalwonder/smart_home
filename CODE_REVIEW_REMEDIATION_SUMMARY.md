# 代码审阅整改收口总结

## 1. 收口结论

本轮整改已完成部分高优先级问题和低风险治理项，但并未完成全部最终审阅问题。

- 建议提交 PR：建议提交为“阶段性整改 PR”，用于合并已验证的 P0、部分 P2、部分 P3 修复。
- 不建议据此直接作为生产上线放行依据：P1 高风险问题仍未完成，部分 P2 也仍未处理。
- 无关改动检查：当前业务代码变更均能对应整改计划；未发现大规模重构、无关格式化污染或不必要的文件重命名。
- 文档检查：已更新 README 和 deploy 说明；未发现仓库存在 CHANGELOG 文件，因此未更新 CHANGELOG。

## 2. 已完成问题清单

| 编号 | 状态 | 完成内容 | 主要文件 |
|---|---|---|---|
| P0-1 | 已完成 | 容器启动不再无条件执行开发数据脚本；开发种子只允许在 local/dev/development/test 且显式开启时执行；开发种子不再覆盖已有 PIN 配置。 | `backend/docker-entrypoint.sh`、`backend/scripts/bootstrap_dev_data.py`、`backend/tests/unit/test_bootstrap_dev_data_safety.py` |
| P0-2 | 代码侧已完成 | 已移除 `deploy/sgcc_electricity/.env`；新增 `.env.example`、deploy README 和明文凭据扫描；CI 增加 secret scan。 | `.github/workflows/ci.yml`、`.gitignore`、`scripts/check_plaintext_secrets.py`、`backend/tests/unit/test_plaintext_secret_scan.py`、`deploy/*` |
| P2-1 | 已完成 | 非本地环境 500 响应不再暴露 `exception_type`；本地环境保留调试信息；服务端日志保留 trace id 和请求路径。 | `backend/src/app/exception_handlers.py`、`backend/tests/integration/test_supporting_routes.py` |
| P2-7 | 已完成 | 删除 ruff F401 未使用导入；后端 ruff 全量检查通过。 | `backend/src/app/catalog_di.py`、`backend/src/main.py` |
| P3-2 | 已完成 | 明确 deploy 模板与运行态数据边界；真实 secret、HA 数据库、SGCC 缓存/二维码继续忽略。 | `.gitignore`、`deploy/README.md`、`deploy/homeassistant/README.md`、`deploy/sgcc_electricity/README.md`、`deploy/sgcc_electricity/.env.example` |
| P3-6 | 短期完成 | SGCC sidecar 基础镜像改为 digest pin；补丁脚本增加 marker 缺失失败和补丁后断言；新增补丁 helper 单测。 | `services/sgcc_electricity_direct_qrcode/Dockerfile`、`services/sgcc_electricity_direct_qrcode/patch_direct_qrcode.py`、`backend/tests/unit/test_sgcc_direct_qrcode_patch.py` |

## 3. 部分完成问题清单

| 编号 | 当前进展 | 未完成内容 | 原因 |
|---|---|---|---|
| P3-1 | 外部镜像已改为 digest pin；README 补充镜像升级策略。 | 后端 Python 依赖锁文件尚未引入。 | 需要先处理 `cryptography` CVE，再在 Python 3.12/CI 路径统一后生成锁文件，避免锁住已知漏洞版本。 |
| P3-3 | 增加架构边界测试，约束非 controller 模块和基础设施层不要反向依赖 app/DI 层。 | 未拆分 `container.py`、`repository_di.py`。 | 拆分 DI 装配属于结构性改造，风险和影响面高，不适合作为低风险收口混入。 |
| P3-4 | 新增样式模块边界说明，明确拆分顺序和视觉回归要求。 | 未拆分 `home.css`、`settings.css`、`layout.css`。 | CSS 拆分容易改变选择器覆盖顺序，需要单独小 PR 配合截图/视觉回归。 |

## 4. 未完成问题清单及原因

| 编号 | 问题 | 未完成原因 | 建议后续动作 |
|---|---|---|---|
| P1-1 | `cryptography` 版本存在已知 CVE | 本轮未处理 P1 依赖升级。 | 升级到修复版本，例如 `cryptography>=46.0.6,<47.0.0`，补 `pip-audit` CI。 |
| P1-2 | 缺少请求级速率限制 | 需要设计 Redis 限流策略、配置、429 响应和日志字段。 | 单独实现认证、bootstrap/pairing、文件下载和全局限流。 |
| P1-3 | 图片上传只信任 Content-Type，存在伪装文件/SVG 风险 | 与上传资源控制强相关，涉及文件类型策略和兼容性。 | 与 P2-2 同批处理，补魔数检测、SVG 策略和响应头隔离。 |
| P1-4 | CI、Compose 与 Playwright 默认端口不一致 | 当前通过显式 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:25173` 验证，但默认配置尚未统一。 | 统一 `FRONTEND_PORT` 和 `PLAYWRIGHT_BASE_URL` 来源，并更新 CI/README。 |
| P2-2 | 上传先全量读入内存再校验大小 | 与 P1-3 上传安全同批处理更安全。 | 分块读取、超过阈值中止，补大文件测试和 Nginx/ASGI 限制。 |
| P2-3 | 本地代理/CORS 与 README 不一致 | 需要确认选择 Vite proxy 还是后端 CORS。 | 推荐优先配置 Vite `/api`、`/ws` proxy，并更新 README。 |
| P2-4 | Nginx 缺少 CSP/HSTS 规划 | CSP 需要结合 WebSocket、data/blob 图片、二维码和部署 HTTPS 入口验证。 | 先制定 report-only 或最小 CSP，再跑 E2E；HSTS 放到实际 TLS 终止入口。 |
| P2-5 | Compose 未设置资源限制 | 需要按目标部署平台和服务资源画像确认数值。 | 为 backend/frontend/HA/SGCC/Postgres/Redis 设置合理 `mem_limit`/`cpus` 或平台资源配置。 |
| P2-6 | PIN 使用 SHA-256 快速哈希 | 涉及旧哈希兼容和渐进迁移，风险高。 | 单独设计 Argon2id/bcrypt 迁移；成功验证旧 PIN 后回写新哈希。 |
| P3-5 | 生产镜像包含 DDL SQL | 当前 Alembic 初始迁移仍运行时读取该 SQL；直接移除会破坏迁移启动。 | 先将初始迁移改造为自包含迁移或迁移 SQL 到 alembic 包内，再移除生产镜像额外 COPY。 |

## 5. 修改过的文件

### 已跟踪文件修改

- `.github/workflows/ci.yml`
- `.gitignore`
- `README.md`
- `backend/Dockerfile`
- `backend/docker-entrypoint.sh`
- `backend/scripts/bootstrap_dev_data.py`
- `backend/src/app/catalog_di.py`
- `backend/src/app/exception_handlers.py`
- `backend/src/main.py`
- `backend/tests/integration/test_supporting_routes.py`
- `backend/tests/unit/test_architecture_boundaries.py`
- `docker-compose.yml`
- `frontend/Dockerfile`
- `services/sgcc_electricity_direct_qrcode/Dockerfile`
- `services/sgcc_electricity_direct_qrcode/patch_direct_qrcode.py`

### 新增文件

- `CODE_REVIEW_REMEDIATION_SUMMARY.md`
- `backend/tests/unit/test_bootstrap_dev_data_safety.py`
- `backend/tests/unit/test_plaintext_secret_scan.py`
- `backend/tests/unit/test_sgcc_direct_qrcode_patch.py`
- `deploy/README.md`
- `deploy/homeassistant/README.md`
- `deploy/sgcc_electricity/.env.example`
- `deploy/sgcc_electricity/README.md`
- `frontend/src/styles/README.md`
- `scripts/check_plaintext_secrets.py`

### 既有未跟踪审阅产物

以下文件是审阅/整改过程产物，是否提交应由项目决定：

- `CODE_REVIEW_REPORT_DRAFT.md`
- `CODE_REVIEW_SECOND_OPINION.md`
- `CODE_REVIEW_REPORT_FINAL.md`
- `CODE_REVIEW_REMEDIATION_PLAN.md`

## 6. 测试和验证结果

| 命令 | 结果 |
|---|---|
| `python -m ruff check backend\src backend\tests services\sgcc_electricity_direct_qrcode\patch_direct_qrcode.py scripts\check_plaintext_secrets.py` | 通过，`All checks passed` |
| `python -m pytest backend\tests -q` | 通过，`198 passed` |
| `python scripts\check_plaintext_secrets.py` | 通过 |
| `docker compose config --quiet` | 通过 |
| `npm run lint` | 通过 |
| `npm run format:check` | 通过 |
| `npm run typecheck` | 通过 |
| `npm test` | 通过，`40` 个测试文件、`180` 个测试通过 |
| `npm run build` | 通过 |
| `docker compose build backend sgcc_electricity` | 通过 |
| `docker compose build frontend` | 通过 |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:25173 npm run test:e2e` | 通过，`20 passed` |
| `git diff --check` | 通过，仅有 Windows CRLF 提示 |

## 7. 无关改动、格式化和文档检查

- 无关改动：未发现与整改计划无关的业务逻辑改动。
- 过度重构：未进行大规模架构重写；DI 和 CSS 仅补边界测试/说明，未做拆分搬迁。
- 格式化污染：`git diff --check` 未发现空白错误；仅提示 Windows 环境下 LF/CRLF 转换。
- README：已更新运行态数据、验证命令、开发数据开关和镜像 digest 维护说明。
- CHANGELOG：仓库未发现 `CHANGELOG*` 文件，未更新。
- 迁移说明：未新增数据库迁移；P3-5 的 DDL 镜像清理仍需单独迁移方案。

## 8. 剩余风险

- P1 高风险问题仍未完成，尤其是 `cryptography` CVE、限流、上传安全和 E2E 默认端口统一。
- SGCC 密码和 Home Assistant 长期 token 的真实轮换需要由凭据拥有者/运维侧完成；代码侧只能防止再次提交和清理本地泄露文件。
- 根目录本地 `.env` 仍是本机运行配置文件，包含敏感键名，应继续保持不提交，并在共享工作区前人工确认。
- 后端生产镜像仍包含 DDL SQL，因为当前 Alembic 初始迁移依赖该文件。
- Docker image digest pin 提高可复现性，但也要求建立定期升级流程，否则安全修复不会自动进入。

## 9. 是否建议提交 PR 或合并

建议提交 PR，但建议 PR 标题和描述明确标注为“阶段性整改”，不要声明全部审阅问题已完成。

- 建议合并范围：P0 修复、P2-1/P2-7 修复、P3 低风险治理和相关测试/文档。
- 不建议作为生产上线最终放行：仍需完成 P1 和剩余 P2。
- 合并前建议人工确认 staged 文件范围，不要误提交本地 `.env`、运行态 deploy 数据或不需要入库的审阅过程文件。

## 10. 建议 commit message

```text
fix: remediate critical review findings and harden project hygiene
```

可选拆分提交：

```text
fix(security): guard dev bootstrap and add secret scan
fix(api): hide internal exception details outside local env
chore(docker): pin base images and assert sgcc patch markers
test: add review remediation regression coverage
docs: document runtime config and verification workflow
```

## 11. 建议 PR 描述

```markdown
## Summary
- Guard dev data bootstrap behind explicit local/dev/test-only opt-in and prevent PIN overwrite.
- Remove local SGCC secret file risk by adding templates, deploy docs, and plaintext secret scan.
- Hide internal exception type from non-local 500 responses while preserving traceable server logs.
- Clean ruff F401 issues and add architecture/patch regression tests.
- Pin Docker/Compose base images by digest and harden SGCC patch failure behavior.
- Document runtime config, validation commands, deploy data boundaries, and stylesheet ownership.

## Validation
- python -m ruff check backend\src backend\tests services\sgcc_electricity_direct_qrcode\patch_direct_qrcode.py scripts\check_plaintext_secrets.py
- python -m pytest backend\tests -q
- python scripts\check_plaintext_secrets.py
- docker compose config --quiet
- npm run lint
- npm run format:check
- npm run typecheck
- npm test
- npm run build
- docker compose build backend sgcc_electricity
- docker compose build frontend
- PLAYWRIGHT_BASE_URL=http://127.0.0.1:25173 npm run test:e2e

## Remaining Work
- P1-1 cryptography CVE and pip-audit gate.
- P1-2 rate limiting.
- P1-3/P2-2 upload safety and streaming size enforcement.
- P1-4 default E2E port unification.
- P2-3/P2-4/P2-5/P2-6 remaining medium-risk items.
- P3-5 DDL SQL removal after Alembic migration refactor.
```
