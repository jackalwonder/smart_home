# 家庭智能中控 Web App 后端项目审查意见报告 v2.4

## 一、审查说明

- 审查对象：`backend/` 当前 FastAPI 后端实现
- 审查基线：
  - 《家庭智能中控 Web App PRD v2.4》
  - 《家庭智能中控 Web App 接口清单 v2.4》
  - 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
  - `document/` 目录下其余冻结实施文档
- 审查目标：
  1. 判断当前后端是否满足冻结阶段实施要求
  2. 找出仍阻断“按冻结接口联调”的实现缺口
  3. 给出下一阶段修复优先级

## 二、总体结论

当前后端已经具备以下实施能力：

1. PostgreSQL + Alembic + Docker 基础运行链路已打通。
2. Home Assistant 连接、加密存储、全量设备重拉、HA 实体同步入库已落地。
3. Xiaomi Home 导入设备已可形成业务设备、实体映射、运行态快照。
4. `device_control_schemas` 已能够从 HA 实体能力自动推导生成。
5. HA WebSocket 实时订阅、增量运行态同步、出站事件入 outbox 已落地。
6. `/ws` 已升级为服务端主动推送，并支持连接内 `sequence` 与客户端 `ack`。

但**当前实现仍未完全符合冻结文档要求**，还不能判定为“接口层全面达标”。  
主要阻断集中在：

1. HTTP 顶层统一响应外壳尚未落地。
2. 冻结接口覆盖仍不完整。
3. 若干已实现接口的返回字段和冻结契约仍有缺口。
4. 控制请求的 payload 校验粒度仍低于冻结要求。

综合判定：

- **数据库主链路**：基本达标
- **HA 同步主链路**：基本达标
- **实时同步主链路**：基本达标
- **HTTP 契约层**：未达标
- **冻结接口覆盖度**：未达标

## 三、已达标或基本达标项

### 3.1 数据与版本主线

1. 版本、草稿、编辑锁、控制幂等、outbox 幂等的数据库约束已基本按冻结文档落地。
2. HA 实体可同步到 `ha_entities / devices / device_entity_links / device_runtime_states`。
3. `device_control_schemas` 已按可控实体自动推导生成。

### 3.2 Home Assistant 接入

1. HA 连接配置已采用加密存储，不再以明文读写。
2. 支持 bootstrap 模式跟随项目整体部署。
3. 已支持全量同步与实时增量状态同步。

### 3.3 WebSocket 基础能力

1. 事件外壳已包含 `event_id / event_type / occurred_at / sequence / home_id / change_domain / snapshot_required / payload`。
2. 连接内 `sequence` 已落地。
3. 客户端 `ack(event_id)` 已可将 outbox 事件标记为已分发。
4. HA 状态变化会自动生成 `device_state_changed / media_state_changed`。

## 四、主要问题清单

### [P1] HTTP 统一响应外壳未落地

冻结规范要求所有 HTTP 接口统一返回：

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "trace_id": "...",
    "server_time": "..."
  }
}
```

当前后端 controller 普遍直接返回裸业务对象或裸字典，未包裹 `success/data/error/meta`。  
这与《统一响应体与错误体规范 v2.4》的冻结要求直接冲突。

影响：

1. 前后端 wire format 不一致。
2. 测试与联调无法按冻结契约编写。
3. 后续错误处理、trace_id、server_time 无法统一。

建议优先级：**最高**

### [P1] 冻结接口覆盖仍不完整

按接口清单，当前后端仍缺少或未落地以下冻结接口：

1. `GET /api/v1/rooms`
2. `GET /api/v1/home/panels/{panel_type}`
3. `GET /api/v1/devices/{device_id}`
4. `GET /api/v1/function-settings`
5. `GET /api/v1/favorites`
6. `GET /api/v1/page-settings`
7. `POST /api/v1/page-assets/floorplan`
8. `POST /api/v1/system/backups`
9. `GET /api/v1/system/backups`
10. `POST /api/v1/system/backups/{backup_id}/restore`
11. `DELETE /api/v1/editor/draft`

影响：

1. 当前只能证明“部分模块已打通”，不能证明“冻结接口已可整体联调”。
2. 备份恢复、页面资源、房间接口、设备详情接口仍无法交付给前端。

建议优先级：**最高**

### [P1] 设备详情冻结接口未实现，导致 `control_schema` 无法按契约对外暴露

虽然 `device_control_schemas` 已经能自动生成，但当前没有 `GET /api/v1/devices/{device_id}`。  
这意味着控制 schema 只存在于数据库内部，尚未形成冻结接口定义中的 `control_schema[]` 对外返回。

影响：

1. 前端无法按冻结详情接口读取可控动作。
2. “导入设备后可用控制定义”在接口层仍未闭环。

建议优先级：**高**

### [P2] 控制请求校验粒度仍低于冻结要求

当前 `DeviceControlCommandService` 只校验：

1. `request_id`
2. 设备存在
3. 设备非只读
4. 设备非离线
5. `action_type` 在 schema 中存在

但冻结文档还要求继续校验：

1. `target_scope`
2. `target_key`
3. `value`
4. `unit`
5. 数值范围与枚举值合法性

影响：

1. 控制入口容易接受“action_type 正确但 payload 非法”的请求。
2. 后端错误码行为会与冻结文档偏离。

建议优先级：**高**

### [P2] WebSocket 虽已具备主动推送和 ack，但“重连补偿闭环”仍未完全成文实现

当前已具备：

1. 主动推送
2. `sequence`
3. `ack`

但仍缺少更明确的“断线重连补偿策略”实现，例如：

1. 连接时显式携带客户端上次已确认位置
2. 服务端按连接状态做定向补发
3. 明确的 snapshot 补偿入口与 WS 协作协议

当前实现更接近“主动推送 + outbox ack + 前端必要时手动 poll”，还不是完整的“sequence 驱动补偿协议”。

建议优先级：**中高**

### [P2] `/ws` 连接鉴权仍偏弱

冻结文档把 `/ws` 归入全局实时入口，要求处理 `terminal_id`、连接标识、补偿链路。  
当前实现虽然接收 `terminal_id`，但尚未真正校验终端存在性、所属家庭关系或连接权限。

影响：

1. 契约层面已带 `terminal_id`，但后端没有把它真正纳入鉴权/追踪。
2. 后续若接入多端状态诊断，连接身份不够稳。

建议优先级：**中**

## 五、建议修复顺序

### 第一批：接口契约收口

1. 增加统一 HTTP 响应外壳中间层或响应构造器。
2. 把已实现接口全部迁到统一 `success/data/error/meta` 返回体。
3. 为错误处理补统一 `trace_id` 与 `server_time`。

### 第二批：补冻结接口覆盖

1. `GET /api/v1/devices/{device_id}`
2. `GET /api/v1/rooms`
3. `GET /api/v1/home/panels/{panel_type}`
4. `GET /api/v1/function-settings`
5. `GET /api/v1/favorites`
6. `GET /api/v1/page-settings`
7. `DELETE /api/v1/editor/draft`

### 第三批：控制契约细化

1. 把 `device_control_schemas` 用于严格 payload 校验。
2. 细化 `INVALID_CONTROL_PAYLOAD` 的触发条件。
3. 让控制查询结果与 WS 控制事件载荷完全对齐。

### 第四批：补偿与运维能力

1. 完整化 `/ws` 重连补偿协议。
2. 完成 `backups` 与 `page-assets` 模块。
3. 把审计日志与系统连接状态演进进一步收口。

## 六、结论

当前后端项目已经从“工程骨架”进入“主链路可运行”的阶段，尤其在以下方面进展明显：

1. HA 接入
2. 实体同步
3. 设备映射
4. 控制 schema 自动推导
5. WebSocket 主动推送

但如果审查标准是“是否已符合前期冻结文档要求”，结论仍然是：

**未完全符合，当前只能判定为“核心后端主链路基本成型，但接口契约层尚未完成冻结收口”。**

因此，下一阶段的正确目标不是继续扩展新能力，而是：

1. 优先补齐冻结接口覆盖
2. 优先统一 HTTP 顶层响应外壳
3. 优先把控制校验和设备详情接口补到冻结契约口径
