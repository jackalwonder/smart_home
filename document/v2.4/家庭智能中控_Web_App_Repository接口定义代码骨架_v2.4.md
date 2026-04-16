# 《家庭智能中控 Web App Repository 接口定义代码骨架 v2.4》

> 版本说明：本文件保留为 v2.4 历史归档，不再作为后端正式骨架基线。  
> v2.4.1 正式基线请使用《家庭智能中控 Web App Repository 接口定义代码骨架 v2.4.1》，后端接口骨架统一为 Python Protocol 风格。

## 一、文档信息

- 文档名称：家庭智能中控 Web App Repository 接口定义代码骨架 v2.4
- 文档类型：工程实施配套文档 / Repository 接口代码骨架
- 适用对象：后端、测试、Codex 任务拆解
- 编制日期：2026-04-14
- 版本状态：已冻结（实施版）
- 基线文档：
  - 《家庭智能中控 Web App Repository 接口草案与读写分层定义 v2.4》
  - 《家庭智能中控 Web App 后端模块骨架与目录设计 v2.4》
  - 《家庭智能中控 Web App PostgreSQL 首版 DDL v2.4》

---

## 二、文档目标

本文件把上一份 Repository 设计文档继续推进为可直接转成代码文件的接口骨架。

输出目标：

1. 明确每个接口文件放置的位置。
2. 给出首版 TypeScript 接口代码骨架。
3. 固定 `shared/kernel`、Provider、Base Repository、Query Repository、Command Repository 的公共抽象。
4. 降低下一步真实编码时的二义性。

本文件不包含：

1. SQL 实现。
2. ORM 装饰器。
3. 框架特定注解。

---

## 三、文件布局

```text
src/
  shared/
    kernel/
      RepoContext.ts
      UnitOfWork.ts
      Clock.ts
      IdGenerator.ts
      VersionTokenGenerator.ts
      EventIdGenerator.ts
  infrastructure/
    capabilities/
      CapabilityProvider.ts
    weather/
      WeatherProvider.ts
    ha/
      HaControlGateway.ts
      HaConnectionGateway.ts
  repositories/
    rows/
      index.ts
    read_models/
      index.ts
    base/
      auth/
      devices/
      settings/
      system/
      editor/
      control/
    query/
      auth/
      overview/
      settings/
      editor/
      control/
      backups/
```

说明：

1. 接口层只保留 `base` 与 `query` 两类目录。
2. 命令型写实现统一放在 `infrastructure/db/repositories/command/`，不在 `src/repositories/` 下重复建立第三套接口目录。

---

## 四、shared/kernel 代码骨架

## 4.1 `src/shared/kernel/RepoContext.ts`

```ts
export interface DbTx {
  readonly id: string;
}

export interface RepoContext {
  readonly tx?: DbTx;
  readonly now?: Date;
}
```

## 4.2 `src/shared/kernel/UnitOfWork.ts`

```ts
import type { DbTx } from './RepoContext';

export interface UnitOfWork {
  runInTransaction<T>(fn: (tx: DbTx) => Promise<T>): Promise<T>;
}
```

## 4.3 `src/shared/kernel/Clock.ts`

```ts
export interface Clock {
  now(): Date;
}
```

## 4.4 `src/shared/kernel/IdGenerator.ts`

```ts
export interface IdGenerator {
  nextId(): string;
}
```

## 4.5 `src/shared/kernel/VersionTokenGenerator.ts`

```ts
export interface VersionTokenGenerator {
  nextSettingsVersion(): string;
  nextLayoutVersion(): string;
  nextDraftVersion(): string;
}
```

## 4.6 `src/shared/kernel/EventIdGenerator.ts`

```ts
export interface EventIdGenerator {
  nextEventId(): string;
}
```

---

## 五、Provider 接口骨架

## 5.1 `src/infrastructure/capabilities/CapabilityProvider.ts`

```ts
export interface CapabilitySnapshot {
  readonly energyEnabled: boolean;
  readonly editorEnabled: boolean;
}

export interface CapabilityProvider {
  getCapabilities(homeId: string): Promise<CapabilitySnapshot>;
}
```

## 5.2 `src/infrastructure/weather/WeatherProvider.ts`

```ts
export interface WeatherSnapshot {
  readonly temperature?: number | null;
  readonly condition?: string | null;
  readonly humidity?: number | null;
  readonly fetchedAt: string;
  readonly cacheMode: boolean;
}

export interface WeatherProvider {
  getSidebarWeather(homeId: string): Promise<WeatherSnapshot | null>;
}
```

## 5.3 `src/infrastructure/ha/HaControlGateway.ts`

```ts
export interface HaControlCommand {
  readonly homeId: string;
  readonly deviceId: string;
  readonly requestId: string;
  readonly actionType: string;
  readonly payload: Record<string, unknown>;
}

export interface HaControlGateway {
  submitControl(command: HaControlCommand): Promise<void>;
}
```

## 5.4 `src/infrastructure/ha/HaConnectionGateway.ts`

```ts
export interface HaConnectionTestInput {
  readonly baseUrl: string;
  readonly authPayload: Record<string, unknown>;
}

export interface HaConnectionTestResult {
  readonly success: boolean;
  readonly status: 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED';
  readonly message?: string | null;
}

export interface HaConnectionGateway {
  testConnection(input: HaConnectionTestInput): Promise<HaConnectionTestResult>;
  triggerFullReload(homeId: string): Promise<void>;
}
```

---

## 六、基础行模型与读模型导出骨架

## 6.1 `src/repositories/rows/index.ts`

```ts
export interface HomeRow {
  id: string;
  homeCode: string | null;
  displayName: string;
  timezone: string;
  status: string;
}

export interface TerminalRow {
  id: string;
  homeId: string;
  terminalCode: string;
  terminalMode: 'KIOSK' | 'DESKTOP';
  terminalName: string;
}

export interface PinSessionRow {
  id: string;
  homeId: string;
  terminalId: string;
  memberId: string | null;
  verifiedForAction: string | null;
  isActive: boolean;
  verifiedAt: string;
  expiresAt: string;
}

export interface HomeAuthConfigRow {
  id: string;
  homeId: string;
  loginMode: 'FIXED_HOME_ACCOUNT';
  pinRetryLimit: number;
  pinLockMinutes: number;
  pinSessionTtlSeconds: number;
}

export interface PinLockRow {
  id: string;
  homeId: string;
  terminalId: string;
  failedAttempts: number;
  lockedUntil: string | null;
  lastFailedAt: string | null;
}

export interface DeviceRow {
  id: string;
  homeId: string;
  roomId: string | null;
  displayName: string;
  rawName: string | null;
  deviceType: string;
  isReadonlyDevice: boolean;
  isComplexDevice: boolean;
  entryBehavior: string;
}

export interface DeviceRuntimeStateRow {
  deviceId: string;
  homeId: string;
  status: string;
  isOffline: boolean;
  runtimeStateJson: Record<string, unknown>;
  statusSummaryJson: Record<string, unknown>;
  lastStateUpdateAt: string | null;
}

export interface DeviceControlSchemaRow {
  id: string;
  deviceId: string;
  actionType: string;
  targetScope: string | null;
  targetKey: string | null;
  valueType: string | null;
  valueRangeJson: Record<string, unknown> | null;
  allowedValuesJson: unknown[] | null;
}

export interface CurrentLayoutVersionRow {
  id: string;
  homeId: string;
  layoutVersion: string;
  backgroundAssetId: string | null;
  effectiveAt: string;
}

export interface CurrentSettingsVersionRow {
  id: string;
  homeId: string;
  settingsVersion: string;
  effectiveAt: string;
}

export interface DraftLeaseRow {
  id: string;
  homeId: string;
  leaseId: string;
  terminalId: string;
  memberId: string | null;
  leaseStatus: 'ACTIVE' | 'RELEASED' | 'LOST' | 'TAKEN_OVER';
  isActive: boolean;
  leaseExpiresAt: string;
  lastHeartbeatAt: string;
}

export interface DeviceControlRequestRow {
  id: string;
  homeId: string;
  requestId: string;
  deviceId: string;
  actionType: string;
  payloadJson: Record<string, unknown>;
  acceptanceStatus: string;
  executionStatus: string;
  finalRuntimeStateJson: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
}

export interface WsEventOutboxRow {
  id: string;
  homeId: string;
  eventId: string;
  eventType: string;
  changeDomain: string;
  snapshotRequired: boolean;
  payloadJson: Record<string, unknown>;
  deliveryStatus: 'PENDING' | 'DISPATCHING' | 'DISPATCHED' | 'FAILED';
  occurredAt: string;
  createdAt: string;
}
```

## 6.2 `src/repositories/read_models/index.ts`

```ts
export interface CurrentLayoutVersion {
  id: string;
  homeId: string;
  layoutVersion: string;
  backgroundAssetId: string | null;
  effectiveAt: string;
}

export interface CurrentSettingsVersion {
  id: string;
  homeId: string;
  settingsVersion: string;
  effectiveAt: string;
}

export interface DeviceCardReadModel {
  deviceId: string;
  roomId: string | null;
  displayName: string;
  deviceType: string;
  status: string;
  isOffline: boolean;
  statusSummary: Record<string, unknown>;
  alertBadges: Array<Record<string, unknown>>;
}

export interface FavoriteDeviceReadModel {
  deviceId: string;
  selected: boolean;
  favoriteOrder: number | null;
}

export interface PageSettingsReadModel {
  roomLabelMode: string;
  homepageDisplayPolicy: Record<string, unknown>;
}

export interface FunctionSettingsReadModel {
  musicEnabled: boolean;
  lowBatteryThreshold: number;
  offlineThresholdSeconds: number;
  favoriteLimit: number;
}

export interface DefaultMediaReadModel {
  bindingStatus: 'MEDIA_UNSET' | 'MEDIA_SET';
  availabilityStatus: 'ONLINE' | 'OFFLINE' | null;
  deviceId: string | null;
}

export interface EditorDraftReadModel {
  draftId: string;
  homeId: string;
  draftVersion: string;
  baseLayoutVersion: string;
  backgroundAssetId: string | null;
  hotspots: Array<Record<string, unknown>>;
  activeLease: DraftLeaseReadModel | null;
}

export interface DraftLeaseReadModel {
  leaseId: string;
  terminalId: string;
  memberId: string | null;
  leaseStatus: 'ACTIVE' | 'RELEASED' | 'LOST' | 'TAKEN_OVER';
  isActive: boolean;
  leaseExpiresAt: string;
  lastHeartbeatAt: string;
}

export interface DeviceControlResultReadModel {
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

## 七、Base Repository 接口代码骨架

## 7.1 `src/repositories/base/auth/HomeRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { HomeRow } from '@/repositories/rows';

export interface HomeRepository {
  findById(homeId: string, ctx?: RepoContext): Promise<HomeRow | null>;
}
```

## 7.2 `src/repositories/base/auth/TerminalRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { TerminalRow } from '@/repositories/rows';

export interface TerminalRepository {
  findById(terminalId: string, ctx?: RepoContext): Promise<TerminalRow | null>;
  findByCode(homeId: string, terminalCode: string, ctx?: RepoContext): Promise<TerminalRow | null>;
  touchLastSeen(terminalId: string, seenAt: Date, ip: string | null, ctx?: RepoContext): Promise<void>;
}
```

## 7.3 `src/repositories/base/auth/HomeAuthConfigRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { HomeAuthConfigRow } from '@/repositories/rows';

export interface HomeAuthConfigRepository {
  findByHomeId(homeId: string, ctx?: RepoContext): Promise<HomeAuthConfigRow | null>;
}
```

## 7.4 `src/repositories/base/auth/PinSessionRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { PinSessionRow } from '@/repositories/rows';

export interface NewPinSessionRow {
  homeId: string;
  terminalId: string;
  memberId: string | null;
  verifiedForAction: string | null;
  sessionTokenHash: string;
  verifiedAt: string;
  expiresAt: string;
}

export interface PinSessionRepository {
  findActiveByHomeAndTerminal(homeId: string, terminalId: string, ctx?: RepoContext): Promise<PinSessionRow | null>;
  insert(input: NewPinSessionRow, ctx?: RepoContext): Promise<PinSessionRow>;
  deactivateActiveByHomeAndTerminal(homeId: string, terminalId: string, ctx?: RepoContext): Promise<number>;
  markExpiredBefore(now: Date, ctx?: RepoContext): Promise<number>;
}
```

## 7.5 `src/repositories/base/auth/PinLockRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { PinLockRow } from '@/repositories/rows';

export interface PinFailureUpsert {
  homeId: string;
  terminalId: string;
  failedAttempts: number;
  lockedUntil: string | null;
  lastFailedAt: string;
}

export interface PinLockRepository {
  findByHomeAndTerminal(homeId: string, terminalId: string, ctx?: RepoContext): Promise<PinLockRow | null>;
  upsertFailure(input: PinFailureUpsert, ctx?: RepoContext): Promise<PinLockRow>;
  clearFailures(homeId: string, terminalId: string, ctx?: RepoContext): Promise<void>;
}
```

## 7.6 `src/repositories/base/devices/DeviceRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { DeviceRow } from '@/repositories/rows';

export interface DeviceListFilter {
  roomId?: string;
  deviceType?: string;
  includeOffline?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface DeviceMappingPatch {
  roomId?: string | null;
  deviceType?: string;
  isPrimaryDevice?: boolean;
  sourceMetaJson?: Record<string, unknown>;
}

export interface DeviceRepository {
  findById(homeId: string, deviceId: string, ctx?: RepoContext): Promise<DeviceRow | null>;
  listByHome(homeId: string, filter: DeviceListFilter, ctx?: RepoContext): Promise<DeviceRow[]>;
  updateMapping(deviceId: string, patch: DeviceMappingPatch, ctx?: RepoContext): Promise<void>;
}
```

## 7.7 `src/repositories/base/devices/DeviceRuntimeStateRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { DeviceRuntimeStateRow } from '@/repositories/rows';

export interface RuntimeStateUpsert {
  deviceId: string;
  homeId: string;
  status: string;
  isOffline: boolean;
  runtimeStateJson: Record<string, unknown>;
  statusSummaryJson: Record<string, unknown>;
  lastStateUpdateAt: string | null;
}

export interface DeviceRuntimeStateRepository {
  findByDeviceIds(homeId: string, deviceIds: string[], ctx?: RepoContext): Promise<DeviceRuntimeStateRow[]>;
  upsertRuntimeState(input: RuntimeStateUpsert, ctx?: RepoContext): Promise<void>;
}
```

## 7.8 `src/repositories/base/settings/LayoutVersionRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { CurrentLayoutVersionRow } from '@/repositories/rows';

export interface NewLayoutVersionRow {
  homeId: string;
  layoutVersion: string;
  backgroundAssetId: string | null;
  layoutMetaJson: Record<string, unknown>;
  effectiveAt: string;
  publishedByMemberId: string | null;
  publishedByTerminalId: string | null;
}

export interface LayoutVersionRepository {
  findCurrentByHome(homeId: string, ctx?: RepoContext): Promise<CurrentLayoutVersionRow | null>;
  insert(input: NewLayoutVersionRow, ctx?: RepoContext): Promise<CurrentLayoutVersionRow>;
}
```

## 7.9 `src/repositories/base/settings/SettingsVersionRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { CurrentSettingsVersionRow } from '@/repositories/rows';

export interface NewSettingsVersionRow {
  homeId: string;
  settingsVersion: string;
  updatedDomainsJson: string[];
  effectiveAt: string;
  savedByMemberId: string | null;
  savedByTerminalId: string | null;
}

export interface SettingsVersionRepository {
  findCurrentByHome(homeId: string, ctx?: RepoContext): Promise<CurrentSettingsVersionRow | null>;
  insert(input: NewSettingsVersionRow, ctx?: RepoContext): Promise<CurrentSettingsVersionRow>;
}
```

## 7.10 `src/repositories/base/editor/DraftLeaseRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { DraftLeaseRow } from '@/repositories/rows';

export interface NewDraftLeaseRow {
  homeId: string;
  leaseId: string;
  terminalId: string;
  memberId: string | null;
  leaseStatus: 'ACTIVE';
  isActive: boolean;
  leaseExpiresAt: string;
  heartbeatIntervalSeconds: number;
  lastHeartbeatAt: string;
  takenOverFromLeaseId?: string | null;
  lostReason?: 'LEASE_EXPIRED' | 'TAKEN_OVER' | null;
}

export interface DraftLeaseRepository {
  findActiveByHomeId(homeId: string, ctx?: RepoContext): Promise<DraftLeaseRow | null>;
  findByLeaseId(homeId: string, leaseId: string, ctx?: RepoContext): Promise<DraftLeaseRow | null>;
  insert(input: NewDraftLeaseRow, ctx?: RepoContext): Promise<DraftLeaseRow>;
  deactivateLease(
    leaseId: string,
    nextStatus: 'RELEASED' | 'LOST' | 'TAKEN_OVER',
    lostReason: 'LEASE_EXPIRED' | 'TAKEN_OVER' | null,
    ctx?: RepoContext,
  ): Promise<void>;
  heartbeat(leaseId: string, heartbeatAt: Date, expiresAt: Date, ctx?: RepoContext): Promise<number>;
}
```

## 7.11 `src/repositories/base/control/DeviceControlRequestRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { DeviceControlRequestRow } from '@/repositories/rows';

export interface NewDeviceControlRequestRow {
  homeId: string;
  requestId: string;
  deviceId: string;
  actionType: string;
  payloadJson: Record<string, unknown>;
  clientTs: string | null;
  acceptanceStatus: string;
  confirmationType: string;
  executionStatus: string;
  timeoutSeconds: number;
}

export interface DeviceControlResultUpdate {
  homeId: string;
  requestId: string;
  executionStatus: string;
  finalRuntimeStateJson: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  completedAt: string | null;
}

export interface DeviceControlRequestRepository {
  findByRequestId(homeId: string, requestId: string, ctx?: RepoContext): Promise<DeviceControlRequestRow | null>;
  insert(input: NewDeviceControlRequestRow, ctx?: RepoContext): Promise<DeviceControlRequestRow>;
  updateExecutionResult(input: DeviceControlResultUpdate, ctx?: RepoContext): Promise<void>;
}
```

## 7.12 `src/repositories/base/realtime/WsEventOutboxRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { WsEventOutboxRow } from '@/repositories/rows';

export interface NewWsEventOutboxRow {
  homeId: string;
  eventId: string;
  eventType: string;
  changeDomain: string;
  snapshotRequired: boolean;
  payloadJson: Record<string, unknown>;
  occurredAt: string;
}

export interface WsEventOutboxRepository {
  insert(input: NewWsEventOutboxRow, ctx?: RepoContext): Promise<WsEventOutboxRow>;
  listPending(limit: number, ctx?: RepoContext): Promise<WsEventOutboxRow[]>;
  markDispatching(ids: string[], ctx?: RepoContext): Promise<void>;
  markDispatched(id: string, ctx?: RepoContext): Promise<void>;
  markFailed(id: string, ctx?: RepoContext): Promise<void>;
}
```

---

## 八、Query Repository 接口代码骨架

## 8.1 `src/repositories/query/auth/AuthSessionQueryRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type {
  FunctionSettingsReadModel,
  CurrentSettingsVersion,
} from '@/repositories/read_models';
import type {
  HomeAuthConfigRow,
  HomeRow,
  PinSessionRow,
  TerminalRow,
} from '@/repositories/rows';

export interface AuthSessionContextReadModel {
  home: HomeRow;
  terminal: TerminalRow;
  authConfig: HomeAuthConfigRow;
  activePinSession: PinSessionRow | null;
  currentSettingsVersion: CurrentSettingsVersion | null;
  functionSettings: FunctionSettingsReadModel | null;
}

export interface AuthSessionQueryRepository {
  getAuthSessionContext(
    homeId: string,
    terminalId: string,
    now: Date,
    ctx?: RepoContext,
  ): Promise<AuthSessionContextReadModel>;
}
```

## 8.2 `src/repositories/query/overview/HomeOverviewQueryRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { HomeOverviewReadModel } from '@/repositories/query/overview/types';

export interface HomeOverviewQueryRepository {
  getOverviewContext(homeId: string, ctx?: RepoContext): Promise<HomeOverviewReadModel>;
}
```

## 8.3 `src/repositories/query/overview/types.ts`

```ts
import type {
  CurrentLayoutVersion,
  DefaultMediaReadModel,
  DeviceCardReadModel,
  FavoriteDeviceReadModel,
  FunctionSettingsReadModel,
  PageSettingsReadModel,
} from '@/repositories/read_models';

export interface EnergySummaryReadModel {
  bindingStatus: string;
  refreshStatus: string;
  yesterdayUsage: number | null;
  monthlyUsage: number | null;
  yearlyUsage: number | null;
  balance: number | null;
}

export interface SystemConnectionSummaryReadModel {
  systemType: string;
  connectionStatus: string;
  authConfigured: boolean;
  lastTestAt: string | null;
  lastSyncAt: string | null;
}

export interface HomeOverviewReadModel {
  layout: CurrentLayoutVersion;
  hotspots: Array<Record<string, unknown>>;
  devices: DeviceCardReadModel[];
  favorites: FavoriteDeviceReadModel[];
  pageSettings: PageSettingsReadModel;
  functionSettings: FunctionSettingsReadModel;
  energy: EnergySummaryReadModel | null;
  media: DefaultMediaReadModel;
  systemConnection: SystemConnectionSummaryReadModel | null;
}
```

## 8.4 `src/repositories/query/settings/SettingsSnapshotQueryRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type {
  CurrentSettingsVersion,
  FavoriteDeviceReadModel,
  FunctionSettingsReadModel,
  PageSettingsReadModel,
} from '@/repositories/read_models';

export interface SettingsSnapshotReadModel {
  currentSettingsVersion: CurrentSettingsVersion | null;
  pageSettings: PageSettingsReadModel | null;
  functionSettings: FunctionSettingsReadModel | null;
  favorites: FavoriteDeviceReadModel[];
}

export interface SettingsSnapshotQueryRepository {
  getCurrentSettingsSnapshot(homeId: string, ctx?: RepoContext): Promise<SettingsSnapshotReadModel>;
}
```

## 8.5 `src/repositories/query/editor/EditorDraftQueryRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { EditorDraftReadModel } from '@/repositories/read_models';

export interface EditorDraftQueryRepository {
  getDraftContext(homeId: string, ctx?: RepoContext): Promise<EditorDraftReadModel | null>;
}
```

## 8.6 `src/repositories/query/editor/EditorLeaseQueryRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { DraftLeaseReadModel } from '@/repositories/read_models';

export type DerivedEditorLockStatus = 'GRANTED' | 'LOCKED_BY_OTHER' | 'READ_ONLY';

export interface EditorLeaseContextReadModel {
  activeLease: DraftLeaseReadModel | null;
  derivedLockStatus: DerivedEditorLockStatus;
}

export interface EditorLeaseQueryRepository {
  getLeaseContext(
    homeId: string,
    terminalId: string,
    now: Date,
    ctx?: RepoContext,
  ): Promise<EditorLeaseContextReadModel>;
}
```

## 8.7 `src/repositories/query/control/DeviceControlQueryRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';
import type { DeviceControlResultReadModel } from '@/repositories/read_models';

export interface DeviceControlQueryRepository {
  getControlResult(
    homeId: string,
    requestId: string,
    ctx?: RepoContext,
  ): Promise<DeviceControlResultReadModel | null>;
}
```

## 8.8 `src/repositories/query/backups/BackupQueryRepository.ts`

```ts
import type { RepoContext } from '@/shared/kernel/RepoContext';

export interface SystemBackupReadModel {
  backupId: string;
  status: string;
  note: string | null;
  createdAt: string;
  restoredAt: string | null;
}

export interface BackupQueryRepository {
  listBackups(homeId: string, ctx?: RepoContext): Promise<SystemBackupReadModel[]>;
}
```

---

## 九、Barrel 导出骨架

## 9.1 `src/repositories/base/index.ts`

```ts
export * from './auth/HomeRepository';
export * from './auth/TerminalRepository';
export * from './auth/HomeAuthConfigRepository';
export * from './auth/PinSessionRepository';
export * from './auth/PinLockRepository';
export * from './devices/DeviceRepository';
export * from './devices/DeviceRuntimeStateRepository';
export * from './settings/LayoutVersionRepository';
export * from './settings/SettingsVersionRepository';
export * from './editor/DraftLeaseRepository';
export * from './control/DeviceControlRequestRepository';
export * from './realtime/WsEventOutboxRepository';
```

## 9.2 `src/repositories/query/index.ts`

```ts
export * from './auth/AuthSessionQueryRepository';
export * from './overview/HomeOverviewQueryRepository';
export * from './overview/types';
export * from './settings/SettingsSnapshotQueryRepository';
export * from './editor/EditorDraftQueryRepository';
export * from './editor/EditorLeaseQueryRepository';
export * from './control/DeviceControlQueryRepository';
export * from './backups/BackupQueryRepository';
```

---

## 十、实现命名约定

接口文件和实现文件统一采用如下命名：

```text
接口：
  DeviceRepository.ts
  HomeOverviewQueryRepository.ts
  WsEventOutboxRepository.ts

实现：
  DeviceRepositoryImpl.ts
  HomeOverviewQueryRepositoryImpl.ts
  WsEventOutboxRepositoryImpl.ts
```

禁止：

1. `DeviceRepo.ts`
2. `CommonQueryRepository.ts`
3. `BaseRepoImpl.ts`

---

## 十一、首批应先落代码的接口

第一优先级：

1. `UnitOfWork`
2. `HomeRepository`
3. `TerminalRepository`
4. `PinSessionRepository`
5. `AuthSessionQueryRepository`
6. `DeviceRepository`
7. `DeviceRuntimeStateRepository`
8. `LayoutVersionRepository`
9. `SettingsVersionRepository`
10. `HomeOverviewQueryRepository`
11. `DeviceControlRequestRepository`
12. `WsEventOutboxRepository`

第二优先级：

1. `SettingsSnapshotQueryRepository`
2. `DraftLeaseRepository`
3. `EditorDraftQueryRepository`
4. `EditorLeaseQueryRepository`
5. `DeviceControlQueryRepository`

---

## 十二、下一步产物

基于这份代码骨架，下一步可以直接进入两种路径之一：

1. 先生成真实代码文件骨架。
2. 先生成首批模块的 Service / Controller 代码骨架。

如果按风险最小路径推进，建议下一步直接生成：

1. `shared/kernel` 实际代码文件
2. `repositories/base` 与 `repositories/query` 首批接口文件
3. `modules/auth`、`modules/home_overview`、`modules/device_control` 的 Service / Controller 骨架

---

## 十三、结论

到这一步，Repository 层已经从“设计说明”推进成了“可直接转文件的代码骨架”。

下一步不需要再补接口文档，可以直接开始落真实 `.ts` 文件。
