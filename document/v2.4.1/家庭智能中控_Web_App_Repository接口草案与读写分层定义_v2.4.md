# 《家庭智能中控 Web App Repository 接口与读写分层定义 v2.4》

> 版本说明：本文件保留 v2.4 业务边界定义；v2.4.1 起所有接口骨架示例统一按 Python/FastAPI 实施口径解释。

## 一、文档信息

- 文档名称：家庭智能中控 Web App Repository 接口与读写分层定义 v2.4
- 文档类型：工程实施配套文档 / Repository 设计实施文档
- 适用对象：后端、测试、Codex 任务拆解
- 编制日期：2026-04-14
- 版本状态：已冻结（实施版）
- 基线文档：
  - 《家庭智能中控 Web App PRD v2.4》
  - 《家庭智能中控 Web App 接口清单 v2.4》
  - 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
  - 《家庭智能中控 Web App 数据库模型初稿 v2.4》
  - 《家庭智能中控 Web App 数据库 ER 图与关系说明 v2.4》
  - 《家庭智能中控 Web App 后端接口实现映射表 v2.4》
  - 《家庭智能中控 Web App PostgreSQL 首版 DDL v2.4》

---

## 二、文档目标

本文件把前一阶段已经冻结的接口映射和 PostgreSQL DDL，继续收口为可直接落后端代码的 Repository 设计：

1. 明确读写分层，不让 query 和 command 再混在一个仓储里。
2. 明确每个领域的 Repository 边界，避免 service 直接拼裸 SQL。
3. 明确事务入口放在哪里，避免 Save All、Publish、Takeover、Restore 做成散写。
4. 明确“当前版本”“当前活跃 lease”“当前默认媒体设备”“最新能耗快照”等公共读取口径。
5. 为下一步后端骨架、migration 集成测试、Repository 单测提供直接输入。

本文件不负责：

1. ORM 具体实现。
2. HTTP Controller 细节。
3. HA SDK 细节。
4. 缓存和消息队列选型细节。

---

## 三、总设计原则

### 3.1 读写分离

1. Query Repository 只负责读取和聚合，不负责推进版本、锁、状态机。
2. Command Repository 只负责写入、状态推进、幂等落库，不拼对外响应读模型。
3. 单表基础 Repository 只负责稳定复用的单表查询和单表写操作。

### 3.2 事务收口

1. 跨表写入必须由 Service 持有事务边界。
2. Repository 不自行开启跨领域事务。
3. Save All、Takeover、Publish、Backup Restore、Control Accept 必须在明确事务内执行。

### 3.3 当前版本统一口径

1. 当前正式 `layout_version` 统一通过 `v_current_layout_versions` 读取。
2. 当前正式 `settings_version` 统一通过 `v_current_settings_versions` 读取。
3. 业务代码不得自行在多个地方重复实现“按 `effective_at desc, created_at desc` 取最新”的规则。

### 3.4 锁状态统一口径

1. `draft_leases` 只保存租约生命周期状态 `lease_status`。
2. 接口返回的 `lock_status` 只允许在 Query Service / Query Repository 层推导。
3. `LOCKED_BY_OTHER`、`READ_ONLY` 不允许写回数据库。

### 3.5 幂等与事件一致性

1. 控制请求幂等以 `(home_id, request_id)` 唯一约束为准。
2. WS 事件幂等以 `(home_id, event_id)` 唯一约束为准。
3. 事件写入与业务状态写入必须在同一事务内完成。

---

## 四、分层结构

实施代码层次如下：

```text
controller / gateway
    -> application service
        -> query repository / command repository / base repository
            -> postgres
        -> capability provider / weather provider / ha adapter / outbox dispatcher
```

目录结构：

```text
src/
  modules/
    auth/
    home_overview/
    rooms_devices/
    device_control/
    settings/
    system_connections/
    editor/
    energy/
    media/
    backups/
    realtime/
    audit/
    ha_adapter/
  repositories/
    base/
    query/
    command/
  db/
    models/
    mappers/
    unit_of_work/
```

---

## 五、Repository 分类

## 5.1 Base Repository

用途：

1. 单表主键读取。
2. 唯一键读取。
3. 简单列表读取。
4. 单表 insert / update。

本层不负责：

1. 首页聚合。
2. Save All 快照写入编排。
3. Publish 事务编排。
4. 跨表锁判断。

## 5.2 Query Repository

用途：

1. 读模型聚合。
2. 当前正式版本解析。
3. 设备详情、首页、设置中心、编辑态只读模型聚合。
4. 将数据库持久化结构翻译为 service 可直接组装响应的领域读模型。

本层不负责：

1. 修改状态。
2. 生成新版本号。
3. 释放锁或接管锁。

## 5.3 Command Repository / 命令写路径

用途：

1. 幂等创建。
2. 版本推进。
3. 锁状态推进。
4. 控制状态流转。
5. Outbox 事件写入。

在 v2.4 实施版中，“Command Repository”表示命令型写路径职责，而不是额外第三套接口命名空间。

实施约定：

1. 单表写职责继续定义在 Base Repository 接口中。
2. Query Repository 只负责读模型聚合。
3. `WsEventOutboxRepository`、`DraftLeaseRepository`、`DeviceControlRequestRepository` 等写接口虽然承担命令职责，但仍以单表 Repository 形式暴露。
4. 具体实现层可以按 `infrastructure/db/repositories/command/` 归档，但接口层不再额外建立 `src/repositories/command/` 命名空间。

---

## 六、公共接口约定

## 6.1 上下文对象

所有 Repository 方法统一接收如下上下文：

```python
interface RepoContext {
  tx?: DbTx;
  now?: Date;
}
```

说明：

1. `tx` 由 Service 在事务场景中透传。
2. `now` 用于测试可控时间，不直接在 Repository 内部写死系统时间。

## 6.2 返回约定

1. Base Repository 返回持久化实体或行模型。
2. Query Repository 返回领域读模型，不直接暴露数据库表结构细节。
3. Command Repository 返回写入结果摘要，例如：
   - 新生成的版本号
   - 新记录主键
   - 状态推进是否成功
   - 是否命中幂等记录

## 6.3 错误边界

1. 唯一约束冲突、外键冲突、行不存在等数据库错误，在 Repository 层翻译为基础数据访问异常。
2. 业务错误码如 `VERSION_CONFLICT`、`EDITOR_LOCKED`、`REQUEST_ID_CONFLICT` 由 Service 层根据 Repository 结果决定。

---

## 七、核心读模型定义

以下读模型不要求与接口 JSON 完全同名，但必须稳定对应接口结构。

### 7.1 当前版本读模型

```python
interface CurrentLayoutVersion {
  id: string;
  homeId: string;
  layoutVersion: string;
  backgroundAssetId: string | null;
  effectiveAt: string;
}

interface CurrentSettingsVersion {
  id: string;
  homeId: string;
  settingsVersion: string;
  effectiveAt: string;
}
```

### 7.2 首页读模型

```python
interface HomeOverviewReadModel {
  layout: CurrentLayoutVersion;
  hotspots: HotspotReadModel[];
  devices: DeviceCardReadModel[];
  favorites: FavoriteDeviceReadModel[];
  pageSettings: PageSettingsReadModel;
  functionSettings: FunctionSettingsReadModel;
  energy: EnergySummaryReadModel | null;
  media: DefaultMediaReadModel;
  systemConnection: SystemConnectionSummaryReadModel | null;
}
```

### 7.3 编辑态读模型

```python
interface EditorDraftReadModel {
  draftId: string;
  homeId: string;
  draftVersion: string;
  baseLayoutVersion: string;
  backgroundAssetId: string | null;
  hotspots: DraftHotspotReadModel[];
  activeLease: DraftLeaseReadModel | null;
}

interface DraftLeaseReadModel {
  leaseId: string;
  terminalId: string;
  memberId: string | null;
  leaseStatus: 'ACTIVE' | 'RELEASED' | 'LOST' | 'TAKEN_OVER';
  isActive: boolean;
  leaseExpiresAt: string;
  lastHeartbeatAt: string;
}
```

### 7.4 控制结果读模型

```python
interface DeviceControlResultReadModel {
  requestId: string;
  deviceId: string;
  acceptanceStatus: string;
  executionStatus: string;
  finalRuntimeState: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
}
```

---

## 八、Base Repository 接口

以下接口使用 Python `Protocol` 风格伪代码表达，其他语言实现保持同样边界即可。

## 8.1 身份与终端域

```python
interface HomeRepository {
  findById(homeId: string, ctx?: RepoContext): Promise<HomeRow | null>;
}

interface MemberRepository {
  findById(memberId: string, ctx?: RepoContext): Promise<MemberRow | null>;
}

interface TerminalRepository {
  findById(terminalId: string, ctx?: RepoContext): Promise<TerminalRow | null>;
  findByCode(homeId: string, terminalCode: string, ctx?: RepoContext): Promise<TerminalRow | null>;
  touchLastSeen(terminalId: string, seenAt: Date, ip: string | null, ctx?: RepoContext): Promise<void>;
}

interface HomeAuthConfigRepository {
  findByHomeId(homeId: string, ctx?: RepoContext): Promise<HomeAuthConfigRow | null>;
}

interface PinSessionRepository {
  findActiveByHomeAndTerminal(homeId: string, terminalId: string, ctx?: RepoContext): Promise<PinSessionRow | null>;
  insert(session: NewPinSessionRow, ctx?: RepoContext): Promise<PinSessionRow>;
  deactivateActiveByHomeAndTerminal(homeId: string, terminalId: string, ctx?: RepoContext): Promise<number>;
  markExpiredBefore(now: Date, ctx?: RepoContext): Promise<number>;
}

interface PinLockRepository {
  findByHomeAndTerminal(homeId: string, terminalId: string, ctx?: RepoContext): Promise<PinLockRow | null>;
  upsertFailure(input: PinFailureUpsert, ctx?: RepoContext): Promise<PinLockRow>;
  clearFailures(homeId: string, terminalId: string, ctx?: RepoContext): Promise<void>;
}
```

## 8.2 设备域

```python
interface RoomRepository {
  listByHome(homeId: string, ctx?: RepoContext): Promise<RoomRow[]>;
}

interface DeviceRepository {
  findById(homeId: string, deviceId: string, ctx?: RepoContext): Promise<DeviceRow | null>;
  listByHome(homeId: string, filter: DeviceListFilter, ctx?: RepoContext): Promise<DeviceRow[]>;
  updateMapping(deviceId: string, patch: DeviceMappingPatch, ctx?: RepoContext): Promise<void>;
}

interface DeviceRuntimeStateRepository {
  findByDeviceIds(homeId: string, deviceIds: string[], ctx?: RepoContext): Promise<DeviceRuntimeStateRow[]>;
  upsertRuntimeState(input: RuntimeStateUpsert, ctx?: RepoContext): Promise<void>;
}

interface DeviceEntityLinkRepository {
  listByDeviceId(homeId: string, deviceId: string, ctx?: RepoContext): Promise<DeviceEntityLinkRow[]>;
  replaceLinksForDevice(deviceId: string, links: NewDeviceEntityLinkRow[], ctx?: RepoContext): Promise<void>;
}

interface DeviceAlertBadgeRepository {
  listActiveByDeviceIds(homeId: string, deviceIds: string[], ctx?: RepoContext): Promise<DeviceAlertBadgeRow[]>;
}

interface DeviceControlSchemaRepository {
  listByDeviceId(deviceId: string, ctx?: RepoContext): Promise<DeviceControlSchemaRow[]>;
}
```

## 8.3 版本与设置域

```python
interface LayoutVersionRepository {
  findCurrentByHome(homeId: string, ctx?: RepoContext): Promise<CurrentLayoutVersion | null>;
  insert(input: NewLayoutVersionRow, ctx?: RepoContext): Promise<LayoutVersionRow>;
}

interface LayoutHotspotRepository {
  listByLayoutVersionId(layoutVersionId: string, ctx?: RepoContext): Promise<LayoutHotspotRow[]>;
  insertBatch(rows: NewLayoutHotspotRow[], ctx?: RepoContext): Promise<void>;
}

interface SettingsVersionRepository {
  findCurrentByHome(homeId: string, ctx?: RepoContext): Promise<CurrentSettingsVersion | null>;
  insert(input: NewSettingsVersionRow, ctx?: RepoContext): Promise<SettingsVersionRow>;
}

interface FavoriteDeviceRepository {
  listBySettingsVersionId(settingsVersionId: string, ctx?: RepoContext): Promise<FavoriteDeviceRow[]>;
  replaceBatch(settingsVersionId: string, rows: NewFavoriteDeviceRow[], ctx?: RepoContext): Promise<void>;
}

interface PageSettingRepository {
  findBySettingsVersionId(settingsVersionId: string, ctx?: RepoContext): Promise<PageSettingRow | null>;
  upsertForSettingsVersion(input: NewPageSettingRow, ctx?: RepoContext): Promise<PageSettingRow>;
}

interface FunctionSettingRepository {
  findBySettingsVersionId(settingsVersionId: string, ctx?: RepoContext): Promise<FunctionSettingRow | null>;
  upsertForSettingsVersion(input: NewFunctionSettingRow, ctx?: RepoContext): Promise<FunctionSettingRow>;
}
```

## 8.4 系统连接 / 电量 / 媒体 / 资源域

```python
interface SystemConnectionRepository {
  findByHomeAndType(homeId: string, systemType: string, ctx?: RepoContext): Promise<SystemConnectionRow | null>;
  upsertHomeAssistant(input: HomeAssistantConnectionUpsert, ctx?: RepoContext): Promise<SystemConnectionRow>;
}

interface EnergyAccountRepository {
  findByHomeId(homeId: string, ctx?: RepoContext): Promise<EnergyAccountRow | null>;
  upsertBinding(input: EnergyBindingUpsert, ctx?: RepoContext): Promise<EnergyAccountRow>;
  unbind(homeId: string, ctx?: RepoContext): Promise<void>;
}

interface EnergySnapshotRepository {
  findLatestByHomeId(homeId: string, ctx?: RepoContext): Promise<EnergySnapshotRow | null>;
  insert(input: NewEnergySnapshotRow, ctx?: RepoContext): Promise<EnergySnapshotRow>;
}

interface MediaBindingRepository {
  findByHomeId(homeId: string, ctx?: RepoContext): Promise<MediaBindingRow | null>;
  upsertBinding(input: MediaBindingUpsert, ctx?: RepoContext): Promise<MediaBindingRow>;
  clearBinding(homeId: string, ctx?: RepoContext): Promise<void>;
}

interface PageAssetRepository {
  insert(input: NewPageAssetRow, ctx?: RepoContext): Promise<PageAssetRow>;
  findById(assetId: string, ctx?: RepoContext): Promise<PageAssetRow | null>;
}
```

## 8.5 编辑态 / 控制 / 审计 / 出站事件域

```python
interface DraftLayoutRepository {
  findByHomeId(homeId: string, ctx?: RepoContext): Promise<DraftLayoutRow | null>;
  upsertCurrentDraft(input: DraftLayoutUpsert, ctx?: RepoContext): Promise<DraftLayoutRow>;
  deleteByHomeId(homeId: string, ctx?: RepoContext): Promise<void>;
}

interface DraftHotspotRepository {
  listByDraftLayoutId(draftLayoutId: string, ctx?: RepoContext): Promise<DraftHotspotRow[]>;
  replaceBatch(draftLayoutId: string, rows: NewDraftHotspotRow[], ctx?: RepoContext): Promise<void>;
  deleteByDraftLayoutId(draftLayoutId: string, ctx?: RepoContext): Promise<void>;
}

interface DraftLeaseRepository {
  findActiveByHomeId(homeId: string, ctx?: RepoContext): Promise<DraftLeaseRow | null>;
  findByLeaseId(homeId: string, leaseId: string, ctx?: RepoContext): Promise<DraftLeaseRow | null>;
  insert(input: NewDraftLeaseRow, ctx?: RepoContext): Promise<DraftLeaseRow>;
  deactivateLease(leaseId: string, nextStatus: 'RELEASED' | 'LOST' | 'TAKEN_OVER', lostReason: string | null, ctx?: RepoContext): Promise<void>;
  heartbeat(leaseId: string, heartbeatAt: Date, expiresAt: Date, ctx?: RepoContext): Promise<number>;
}

interface DeviceControlRequestRepository {
  findByRequestId(homeId: string, requestId: string, ctx?: RepoContext): Promise<DeviceControlRequestRow | null>;
  insert(input: NewDeviceControlRequestRow, ctx?: RepoContext): Promise<DeviceControlRequestRow>;
  updateExecutionResult(input: DeviceControlResultUpdate, ctx?: RepoContext): Promise<void>;
}

interface DeviceControlTransitionRepository {
  insert(input: NewDeviceControlTransitionRow, ctx?: RepoContext): Promise<DeviceControlTransitionRow>;
  listByControlRequestId(controlRequestId: string, ctx?: RepoContext): Promise<DeviceControlTransitionRow[]>;
}

interface BackupRepository {
  findByBackupId(homeId: string, backupId: string, ctx?: RepoContext): Promise<SystemBackupRow | null>;
  listByHomeId(homeId: string, ctx?: RepoContext): Promise<SystemBackupRow[]>;
  insert(input: NewSystemBackupRow, ctx?: RepoContext): Promise<SystemBackupRow>;
  markRestored(backupId: string, restoredAt: Date, ctx?: RepoContext): Promise<void>;
}

interface AuditLogRepository {
  insert(input: NewAuditLogRow, ctx?: RepoContext): Promise<AuditLogRow>;
}

interface WsEventOutboxRepository {
  insert(input: NewWsEventOutboxRow, ctx?: RepoContext): Promise<WsEventOutboxRow>;
  listPending(limit: number, ctx?: RepoContext): Promise<WsEventOutboxRow[]>;
  markDispatching(ids: string[], ctx?: RepoContext): Promise<void>;
  markDispatched(id: string, ctx?: RepoContext): Promise<void>;
  markFailed(id: string, ctx?: RepoContext): Promise<void>;
}

interface HaSyncStatusRepository {
  findByHomeId(homeId: string, ctx?: RepoContext): Promise<HaSyncStatusRow | null>;
  upsert(input: HaSyncStatusUpsert, ctx?: RepoContext): Promise<HaSyncStatusRow>;
}
```

---

## 九、Query Repository 接口

## 9.1 认证与会话查询

```python
interface AuthSessionQueryRepository {
  getAuthSessionContext(homeId: string, terminalId: string, now: Date, ctx?: RepoContext): Promise<{
    home: HomeRow;
    terminal: TerminalRow;
    authConfig: HomeAuthConfigRow;
    activePinSession: PinSessionRow | null;
    currentSettingsVersion: CurrentSettingsVersion | null;
    functionSettings: FunctionSettingRow | null;
  }>;
}
```

说明：

1. 只聚合数据库内字段。
2. `features.energy_enabled / editor_enabled` 不在本仓储中解析，由 `CapabilityProvider` 注入。

## 9.2 首页与设备读取

```python
interface HomeOverviewQueryRepository {
  getOverviewContext(homeId: string, ctx?: RepoContext): Promise<HomeOverviewReadModel>;
}

interface PanelQueryRepository {
  getPanelDevices(homeId: string, panelType: string, ctx?: RepoContext): Promise<DeviceCardReadModel[]>;
}

interface DeviceDetailQueryRepository {
  getDeviceDetail(homeId: string, deviceId: string, ctx?: RepoContext): Promise<DeviceDetailReadModel | null>;
}

interface RoomsQueryRepository {
  listRoomsWithCounts(homeId: string, ctx?: RepoContext): Promise<RoomWithDeviceCountReadModel[]>;
}
```

说明：

1. `HomeOverviewQueryRepository` 只聚合库内数据，不直接读取天气。
2. `sidebar.weather` 由 `WeatherProvider` 在 Service 层补齐。
3. 默认媒体 `availability_status` 由已绑定设备运行态推导，不信任绑定表缓存值。

## 9.3 设置中心读取

```python
interface SettingsSnapshotQueryRepository {
  getCurrentSettingsSnapshot(homeId: string, ctx?: RepoContext): Promise<{
    currentSettingsVersion: CurrentSettingsVersion | null;
    pageSettings: PageSettingsReadModel | null;
    functionSettings: FunctionSettingsReadModel | null;
    favorites: FavoriteDeviceReadModel[];
  }>;
}

interface SettingsPageQueryRepository {
  getSettingsPage(homeId: string, terminalId: string, now: Date, ctx?: RepoContext): Promise<SettingsPageReadModel>;
}
```

说明：

1. 设置页聚合查询允许额外拼 `system_connections / energy / media / pin_session_active`。
2. `favorites/page/function` 必须来自同一个当前 `settings_version`。

## 9.4 编辑态读取

```python
interface EditorDraftQueryRepository {
  getDraftContext(homeId: string, ctx?: RepoContext): Promise<EditorDraftReadModel | null>;
}

interface EditorLeaseQueryRepository {
  getLeaseContext(homeId: string, terminalId: string, now: Date, ctx?: RepoContext): Promise<{
    activeLease: DraftLeaseReadModel | null;
    derivedLockStatus: 'GRANTED' | 'LOCKED_BY_OTHER' | 'READ_ONLY';
  }>;
}
```

说明：

1. `derivedLockStatus` 在查询层推导。
2. 推导规则：
   - 无 active lease 且可创建：`GRANTED` 候选
   - active lease 属于当前终端：`GRANTED`
   - active lease 属于其他终端且请求允许接管前：`LOCKED_BY_OTHER`
   - active lease 已失效或终端只读打开：`READ_ONLY`

## 9.5 控制与备份读取

```python
interface DeviceControlQueryRepository {
  getControlResult(homeId: string, requestId: string, ctx?: RepoContext): Promise<DeviceControlResultReadModel | null>;
}

interface BackupQueryRepository {
  listBackups(homeId: string, ctx?: RepoContext): Promise<SystemBackupReadModel[]>;
}
```

---

## 十、Command Repository 使用约束

## 10.1 SettingsSaveService

事务内顺序固定为：

1. `SettingsVersionRepository.findCurrentByHome`
2. 校验请求 `settings_version`
3. `SettingsVersionRepository.insert`
4. `FavoriteDeviceRepository.replaceBatch`
5. `PageSettingRepository.upsertForSettingsVersion`
6. `FunctionSettingRepository.upsertForSettingsVersion`
7. `AuditLogRepository.insert`
8. `WsEventOutboxRepository.insert`

要求：

1. `replaceBatch` 只能写新 `settings_version_id` 对应快照，不得改历史版本。
2. 事件 `settings_updated` 必须和版本推进在同一事务内提交。

## 10.2 EditorSessionService

创建或接管 lease 时的事务规则：

1. 先查 `DraftLeaseRepository.findActiveByHomeId`
2. 如空，则 `DraftLeaseRepository.insert`
3. 如已有且归他人，接管流程必须：
   - `DraftLeaseRepository.deactivateLease(oldLeaseId, 'TAKEN_OVER', 'TAKEN_OVER')`
   - `DraftLeaseRepository.insert(newLease)`
   - `AuditLogRepository.insert`
   - `WsEventOutboxRepository.insert(draft_taken_over)`
   - `WsEventOutboxRepository.insert(draft_lock_lost)`
4. 整个过程必须使用同一事务，并依赖数据库 partial unique index 兜底。

## 10.3 EditorDraftService

草稿保存事务：

1. `DraftLeaseRepository.findByLeaseId`
2. 校验 lease 归属、有效期、`lease_status=ACTIVE`
3. `DraftLayoutRepository.upsertCurrentDraft`
4. `DraftHotspotRepository.replaceBatch`
5. 返回新 `draft_version`

要求：

1. 不写 `layout_versions`
2. 不写 `ws_event_outbox`
3. 不改变 `lease_status`

## 10.4 EditorPublishService

发布事务：

1. `DraftLeaseRepository.findByLeaseId`
2. `DraftLayoutRepository.findByHomeId`
3. `LayoutVersionRepository.findCurrentByHome`
4. 校验 `lease_id + draft_version + base_layout_version`
5. `LayoutVersionRepository.insert`
6. `LayoutHotspotRepository.insertBatch`
7. `DraftLeaseRepository.deactivateLease(leaseId, 'RELEASED', null)`
8. `AuditLogRepository.insert`
9. `WsEventOutboxRepository.insert(publish_succeeded)`

要求：

1. 不允许直接覆盖旧正式布局。
2. 发布成功后正式版本切换依赖 `v_current_layout_versions` 读取口径自然生效。

## 10.5 DeviceControlCommandService

控制受理事务：

1. `DeviceControlRequestRepository.findByRequestId`
2. 若存在：
   - 语义一致则返回旧记录
   - 语义不一致则上抛 `REQUEST_ID_CONFLICT`
3. `DeviceControlRequestRepository.insert`
4. `DeviceControlTransitionRepository.insert`
5. `AuditLogRepository.insert`

异步结果推进事务：

1. `DeviceControlRequestRepository.updateExecutionResult`
2. `DeviceControlTransitionRepository.insert`
3. 必要时 `DeviceRuntimeStateRepository.upsertRuntimeState`
4. `WsEventOutboxRepository.insert`

## 10.6 BackupRestoreService

恢复事务：

1. `BackupRepository.findByBackupId`
2. 从备份载荷解出目标 settings/layout 快照
3. `SettingsVersionRepository.insert`
4. `FavoriteDeviceRepository.replaceBatch`
5. `PageSettingRepository.upsertForSettingsVersion`
6. `FunctionSettingRepository.upsertForSettingsVersion`
7. `LayoutVersionRepository.insert`
8. `LayoutHotspotRepository.insertBatch`
9. `BackupRepository.markRestored`
10. `AuditLogRepository.insert`
11. `WsEventOutboxRepository.insert(backup_restore_completed)`

要求：

1. 必须生成新的 `settings_version` 与 `layout_version`。
2. 不能原地覆盖旧版本。

---

## 十一、Unit of Work 接口

为避免 Service 手动传递过多 `tx`，统一使用如下事务协调器：

```python
interface UnitOfWork {
  runInTransaction<T>(fn: (tx: DbTx) => Promise<T>): Promise<T>;
}
```

注入方式：

```python
interface Repositories {
  home: HomeRepository;
  terminals: TerminalRepository;
  settingsVersions: SettingsVersionRepository;
  layoutVersions: LayoutVersionRepository;
  draftLeases: DraftLeaseRepository;
  outbox: WsEventOutboxRepository;
  auditLogs: AuditLogRepository;
}
```

说明：

1. Application Service 持有 `UnitOfWork`。
2. Repository 保持无状态。
3. 测试时可替换为内存事务桩或 test transaction。

---

## 十二、最小实现优先级

## 12.1 第一批必须先落地

1. `AuthSessionQueryRepository`
2. `HomeOverviewQueryRepository`
3. `DeviceDetailQueryRepository`
4. `DeviceControlRequestRepository`
5. `DeviceControlTransitionRepository`
6. `WsEventOutboxRepository`
7. `LayoutVersionRepository`
8. `SettingsVersionRepository`

原因：

1. 能先打通首页、设备详情、控制主链路。
2. 能验证当前版本视图、幂等、事件落库三条核心机制。

## 12.2 第二批

1. `SettingsSnapshotQueryRepository`
2. `PageSettingRepository`
3. `FunctionSettingRepository`
4. `FavoriteDeviceRepository`
5. `SystemConnectionRepository`
6. `EnergyAccountRepository`
7. `MediaBindingRepository`

## 12.3 第三批

1. `EditorDraftQueryRepository`
2. `EditorLeaseQueryRepository`
3. `DraftLayoutRepository`
4. `DraftHotspotRepository`
5. `DraftLeaseRepository`
6. `LayoutHotspotRepository`

## 12.4 第四批

1. `BackupRepository`
2. `AuditLogRepository`
3. `HaSyncStatusRepository`
4. `RoomsQueryRepository`
5. `PanelQueryRepository`

---

## 十三、实现红线

1. 不允许做“万能 Repository”，把所有表都挂进一个 `CommonRepository`。
2. 不允许在 Query Repository 中偷偷写状态。
3. 不允许在 Command Repository 中直接拼 HTTP 返回体。
4. 不允许应用层自行判定“当前版本”，必须统一走当前版本视图或等价封装。
5. 不允许把 `LOCKED_BY_OTHER / READ_ONLY` 写回 `draft_leases`。
6. 不允许把 `media_bindings.availability_status` 当成正式真源覆盖运行态推导。
7. 不允许在业务事务提交前直接推送 WS；必须先写 outbox。

---

## 十四、下一步产物

在本稿基础上，下一步应直接继续输出两类产物：

1. 《后端模块骨架与目录设计 v2.4》
2. 《Repository 接口定义代码骨架 v2.4》

推荐顺序：

1. 先定模块目录、依赖方向、DTO 放置位置。
2. 再按模块输出 Python 接口骨架。
3. 最后补 Repository 单测清单和事务用例清单。

---

## 十五、结论

到这一层为止，v2.4 的工程链路已经从：

1. 冻结 PRD / 接口 / 响应规范
2. 数据库模型 / ER / 接口映射
3. PostgreSQL 首版 DDL

进一步推进到了：

4. Repository 接口边界
5. Query / Command 读写分层
6. 核心事务写路径收口

这意味着下一步已经可以直接进入后端代码骨架，而不需要再回头讨论数据库边界或仓储职责。
