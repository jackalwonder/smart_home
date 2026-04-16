# 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》  
  
## 一、文档信息  
  
- **文档名称**：家庭智能中控 Web App 统一响应体与错误体规范 v2.4  
- **文档类型**：接口契约配套规范  
- **适用对象**：前端、后端、测试、运维、Codex 任务拆解  
- **基线文档**：  
    - 《家庭智能中控 Web App PRD v2.4》  
    - 《家庭智能中控 Web App 接口清单 v2.4》  
- **版本状态**：已冻结  
- **编制日期**：2026-04-14  
- **版本定位**：与 PRD v2.4、接口清单 v2.4 完整对齐的统一响应外壳、错误外壳与 WebSocket 事件外壳规范  
  
### 1.1 本版修订重点  
  
本版相对于上一版规范，完成以下收口：  
  
1. 将基线文档更新为 **PRD v2.4 + 接口清单 v2.4**。  
2. 延续默认媒体设备控制统一走 ==POST /api/v1/device-controls== 的冻结规则，不恢复媒体专用控制入口。  
3. 保持控制结果查询字段统一为 ==final_runtime_state==，并延续 ==related_request_id== 的控制事件归因规则。  
4. 对齐首页总览聚合结构：时间、天气、音乐卡片、全屋摘要统一归属 ==sidebar== 业务对象。  
5. 明确默认媒体设备返回体中的“绑定状态”和“在线可用状态”是两个独立维度，分别由 ==binding_status== 与 ==availability_status== 表达。  
6. 新增备份恢复完成事件 ==backup_restore_completed==，补齐恢复后的全端同步闭环。  
7. 继续坚持读取类缓存态优先采用 **成功响应 + ==data.cache_mode = true==** 的表达方式。  
8. 统一约束：所有接口只保留一个服务端标准时间源，即 ==meta.server_time==。  
  
---  
## 二、适用范围  
  
本规范适用于以下能力范围：  
  
1. 认证与 PIN 会话  
2. 首页总览与浮层  
3. 房间与设备列表 / 设备详情  
4. 单设备控制与控制结果查询  
5. 设置中心 Save All  
6. 编辑态 Draft / Publish / Lease / Heartbeat / Takeover  
7. 电量绑定与刷新  
8. 默认媒体设备绑定与展示  
9. 系统连接配置、测试连接、设备重拉  
10. 页面资源上传  
11. 备份与恢复  
12. WebSocket 实时事件  
  
本规范不覆盖：  
  
1. 文件上传二进制传输协议细节  
2. 数据库内部模型与表设计  
3. 第三方适配层内部私有响应  
4. Home Assistant 原始实体返回体  
  
## 三、统一规则总则  
  
### 3.1 统一目标  
  
统一响应体规范的目标不是抹平所有业务字段，而是统一：  
  
1. HTTP 成功 / 失败的顶层外壳  
2. 异步受理与最终结果的语义边界  
3. 错误码与错误对象结构  
4. 分页信息结构  
5. WebSocket 事件外壳结构  
  
因此：  
  
1. 所有 HTTP 接口必须具备稳定的顶层外壳  
2. 业务数据统一放在 ==data==  
3. 失败信息统一放在 ==error==  
4. 成功与失败由 ==success== 表达  
5. 请求追踪统一使用 ==meta.trace_id==  
6. 服务端时间统一使用 ==meta.server_time==  
  
### 3.2 命名规则  
  
PRD 中的 camelCase 概念，在接口 wire format 中统一使用 snake_case。  
  
例如：  
  
1. ==requestId== -> ==request_id==  
2. ==layoutVersion== -> ==layout_version==  
3. ==settingsVersion== -> ==settings_version==  
4. ==defaultControlTarget== -> ==default_control_target==  
5. ==relatedRequestId== -> ==related_request_id==  
  
### 3.3 时间字段  
  
所有时间字段统一使用 ISO 8601 字符串。  
  
建议后端统一使用 UTC 存储，并在接口输出标准 ISO 8601 时间。  
  
示例：  
  
```
"occurred_at": "2026-04-14T09:30:00Z"


```
  
  
  
### 3.4 布尔字段  
  
布尔字段只使用 ==true / false==，不使用 ==0 / 1== 或字符串。  
  
### 3.5 ID 字段  
  
所有资源 ID、版本 ID、租约 ID、请求 ID，统一对前端暴露为字符串。  
  
### 3.6 ==request_id== 规则  
  
1. 所有控制类请求必须携带 ==request_id==  
2. ==request_id== 由前端生成并传入  
3. ==request_id== 在家庭级范围内全局唯一  
4. 幂等窗口为 ==10 分钟==  
  
## 四、统一 HTTP 响应体规范  
  
### 4.1 顶层外壳  
  
```
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "trace_id": "trace_01",
    "server_time": "2026-04-14T09:30:00Z"
  }
}


```
  
  
  
**4.2 顶层字段说明**  

| 字段               | 类型             | 是否必填 | 说明            |
| ---------------- | -------------- | ---- | ------------- |
| success          | boolean        | 是    | 是否成功返回规范化业务结果 |
| data             | object \| null | 是    | 成功时的业务数据      |
| error            | object \| null | 是    | 失败时的错误对象      |
| meta             | object         | 是    | 元信息           |
| meta.trace_id    | string         | 是    | 请求追踪 ID       |
| meta.server_time | string         | 是    | 服务端返回时间       |
  
  
  
### 4.3 ==success== 语义边界  
  
==success== 表示“本次 HTTP 调用是否成功返回了规范化业务结果”，**不等同于业务动作最终成功**。  
  
例如：  
  
1. ==GET /api/v1/device-controls/{request_id}== 成功返回控制结果，且 ==execution_status = TIMEOUT==  
  
2. 此时仍应为：  
3. 此时仍应为：  
    - ==success = true==  
    - ==data.error_code = CONTROL_TIMEOUT==  
4. ==POST /api/v1/device-controls== 因设备离线被后端直接拒绝  
  
5. 此时应为：  
6. 此时应为：  
    - ==success = false==  
    - ==error.code = DEVICE_OFFLINE==  
  
### 4.4 成功响应示例  
  
```
{
  "success": true,
  "data": {
    "settings_version": "s_20260414_002"
  },
  "error": null,
  "meta": {
    "trace_id": "trace_02",
    "server_time": "2026-04-14T09:31:00Z"
  }
}


```
  
  
  
### 4.5 失败响应示例  
  
```
{
  "success": false,
  "data": null,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "版本已变化，请刷新后重试",
    "details": {
      "expected_settings_version": "s_001",
      "actual_settings_version": "s_002"
    }
  },
  "meta": {
    "trace_id": "trace_03",
    "server_time": "2026-04-14T09:32:00Z"
  }
}


```
  
  
---  
## 五、统一成功响应分类  
  
### 5.1 同步读取型响应  
  
适用于：  
  
1. ==GET /api/v1/auth/session==  
2. ==GET /api/v1/home/overview==  
3. ==GET /api/v1/home/panels/{panel_type}==  
4. ==GET /api/v1/rooms==  
5. ==GET /api/v1/devices==  
6. ==GET /api/v1/devices/{device_id}==  
7. ==GET /api/v1/settings==  
8. ==GET /api/v1/energy==  
9. ==GET /api/v1/media/default==  
  
统一规则：  
  
1. ==success = true==  
2. ==data== 为读取结果  
3. ==error = null==  
  
### 5.2 同步保存型响应  
  
适用于：  
  
1. ==PUT /api/v1/settings==  
2. ==PUT /api/v1/system-connections/home-assistant==  
3. ==PUT /api/v1/energy/binding==  
4. ==DELETE /api/v1/energy/binding==  
5. ==PUT /api/v1/media/default/binding==  
6. ==DELETE /api/v1/media/default/binding==  
7. ==PUT /api/v1/device-mappings/{device_id}==  
8. ==PUT /api/v1/editor/draft==  
9. ==POST /api/v1/editor/publish==  
  
统一规则：  
  
1. ==success = true==  
2. ==data== 中必须包含本次保存 / 发布结果  
3. 若涉及版本变化，必须返回新版本号或生效时间  
  
### 5.3 异步受理型响应  
  
适用于：  
  
1. ==POST /api/v1/device-controls==  
  
补充说明：  
  
1. ==POST /api/v1/system-connections/home-assistant/test==  
2. ==POST /api/v1/devices/reload==  
3. ==POST /api/v1/energy/refresh==  
  
上述接口虽也可能体现“启动后异步完成”的业务语义，但当前冻结版本**不强制**接入完整的“控制受理 -> 结果查询”模型。  
  
它们可返回各自的简化受理结果，只要顶层外壳与错误外壳保持统一即可。  
  
---  
## 六、控制受理响应规范  
  
### 6.1 适用接口  
  
1. ==POST /api/v1/device-controls==  
  
### 6.2 统一外壳  
  
```
{
  "success": true,
  "data": {
    "request_id": "req_001",
    "device_id": "dev_001",
    "accepted": true,
    "acceptance_status": "ACCEPTED",
    "confirmation_type": "TARGET_STATE_DRIVEN",
    "accepted_at": "2026-04-14T09:30:00Z",
    "timeout_seconds": 5,
    "retry_scheduled": false,
    "message": "控制请求已受理",
    "result_query_path": "/api/v1/device-controls/req_001"
  },
  "error": null,
  "meta": {
    "trace_id": "trace_04",
    "server_time": "2026-04-14T09:30:00Z"
  }
}


```
  
  
  
**6.3 字段说明**  

| 字段                | 类型             | 说明               |
| ----------------- | -------------- | ---------------- |
| request_id        | string         | 本次控制请求唯一 ID      |
| device_id         | string         | 目标业务设备 ID        |
| accepted          | boolean        | 是否已被后端受理         |
| acceptance_status | enum           | 仅表达受理结果          |
| confirmation_type | enum           | 该设备控制确认类型        |
| accepted_at       | string         | 受理时间             |
| timeout_seconds   | integer        | 最终结果超时阈值         |
| retry_scheduled   | boolean        | 后端是否已进入允许的自动重试流程 |
| message           | string \| null | 面向前端的简短说明        |
| result_query_path | string         | 控制结果查询路径         |
  
  
  
### 6.4 ==acceptance_status== 枚举  
  
统一受理态只保留两类：  
  
1. ==ACCEPTED==  
2. ==REJECTED==  
  
以下状态不属于受理态：  
  
1. ==PENDING==  
2. ==ACK_SUCCESS==  
3. ==SUCCESS==  
4. ==FAILED==  
5. ==TIMEOUT==  
6. ==STATE_MISMATCH==  
  
### 6.5 受理失败响应  
  
若请求未被受理，则返回统一失败外壳。示例：  
  
```
{
  "success": false,
  "data": null,
  "error": {
    "code": "DEVICE_OFFLINE",
    "message": "设备当前离线，暂不可控制"
  },
  "meta": {
    "trace_id": "trace_05",
    "server_time": "2026-04-14T09:31:00Z"
  }
}


```
  
  
  
### 6.6 受理层不得表达最终控制失败  
  
以下状态或错误，不应出现在控制受理接口的同步成功体或同步错误体中作为“最终结果”：  
  
1. ==CONTROL_TIMEOUT==  
2. ==STATE_MISMATCH==  
3. ==RECONCILING==  
  
它们只应出现在：  
  
1. ==GET /api/v1/device-controls/{request_id}== 的查询结果中  
2. 对应 WebSocket 控制结果事件中  
  
## 七、控制结果查询响应规范  
  
### 7.1 适用接口  
  
1. ==GET /api/v1/device-controls/{request_id}==  
  
### 7.2 统一外壳  
  
```
{
  "success": true,
  "data": {
    "request_id": "req_001",
    "device_id": "dev_001",
    "action_type": "SET_POWER_STATE",
    "payload": {
      "target_scope": null,
      "target_key": "power",
      "value": true,
      "unit": null
    },
    "acceptance_status": "ACCEPTED",
    "confirmation_type": "ACK_DRIVEN",
    "execution_status": "SUCCESS",
    "retry_count": 0,
    "accepted_at": "2026-04-14T09:30:00Z",
    "completed_at": "2026-04-14T09:30:01Z",
    "final_runtime_state": {
      "aggregated_state": "ON"
    },
    "error_code": null,
    "error_message": null
  },
  "error": null,
  "meta": {
    "trace_id": "trace_06",
    "server_time": "2026-04-14T09:30:01Z"
  }
}


```
  
  
  
### 7.3 ==execution_status== 枚举  
  
统一执行态如下：  
  
1. ==PENDING==  
2. ==ACK_SUCCESS==  
3. ==SUCCESS==  
4. ==RECONCILING==  
5. ==FAILED==  
6. ==TIMEOUT==  
7. ==STATE_MISMATCH==  
  
### 7.4 失败类状态时的字段要求  
  
当 ==execution_status== 为以下任一值时：  
  
1. ==FAILED==  
2. ==TIMEOUT==  
3. ==STATE_MISMATCH==  
  
应同时返回：  
  
1. ==error_code==  
2. ==error_message==  
  
示例：  
  
```
{
  "success": true,
  "data": {
    "request_id": "req_002",
    "execution_status": "TIMEOUT",
    "error_code": "CONTROL_TIMEOUT",
    "error_message": "控制在规定时间内未完成"
  },
  "error": null,
  "meta": {
    "trace_id": "trace_07",
    "server_time": "2026-04-14T09:30:08Z"
  }
}


```
  
  
  
### 7.5 顶层 ==error.code== 与 ==data.error_code== 的边界  
  
统一规则如下：  
  
1. 顶层 ==error.code== 用于表达“本次 HTTP 请求未成功处理成业务结果”  
2. ==data.error_code== 用于表达“HTTP 请求成功返回了业务结果，但业务动作本身失败”  
  
典型示例：  
  
1. ==POST /api/v1/device-controls== 因 ==READONLY_DEVICE== 被入口层直接拒绝  
  
2. 使用顶层 ==error.code = READONLY_DEVICE==  
3. 使用顶层 ==error.code = READONLY_DEVICE==  
4. ==GET /api/v1/device-controls/{request_id}== 成功返回结果，但最终 ==execution_status = TIMEOUT==  
  
5. 使用 ==data.error_code = CONTROL_TIMEOUT==  
6. 使用 ==data.error_code = CONTROL_TIMEOUT==  
  
## 八、列表与分页响应规范  
  
### 8.1 统一原则  
  
统一的是**顶层外壳**与**分页对象结构**，不强制所有接口都使用相同的业务集合字段名。  
  
也就是说：  
  
1. ==GET /api/v1/devices== 可以返回 ==data.items==  
2. ==GET /api/v1/system/backups== 可以返回 ==data.items==  
3. ==GET /api/v1/rooms== 可以返回 ==data.rooms==  
  
只要：  
  
1. 顶层仍为 ==success / data / error / meta==  
2. 分页信息若存在，统一放在 ==page_info==  
  
### 8.2 无分页列表示例  
  
```
{
  "success": true,
  "data": {
    "rooms": [
      {
        "room_id": "room_001",
        "room_name": "客厅"
      }
    ]
  },
  "error": null,
  "meta": {
    "trace_id": "trace_08",
    "server_time": "2026-04-14T09:32:00Z"
  }
}


```
  
  
  
### 8.3 有分页列表示例  
  
```
{
  "success": true,
  "data": {
    "items": [],
    "page_info": {
      "page": 1,
      "page_size": 20,
      "total": 100,
      "has_next": true
    }
  },
  "error": null,
  "meta": {
    "trace_id": "trace_09",
    "server_time": "2026-04-14T09:33:00Z"
  }
}


```
  
  
  
**8.4 ==page_info== 字段说明**  

| 字段        | 类型      | 说明      |
| --------- | ------- | ------- |
| page      | integer | 当前页码    |
| page_size | integer | 当前页大小   |
| total     | integer | 总数量     |
| has_next  | boolean | 是否存在下一页 |
  
  
---  
## 九、设置、发布与版本响应规范  
  
### 9.1 Save All 响应  
  
适用于：  
  
1. ==PUT /api/v1/settings==  
  
```
{
  "success": true,
  "data": {
    "saved": true,
    "settings_version": "s_20260414_002",
    "updated_domains": [
      "FAVORITES",
      "PAGE_SETTINGS",
      "FUNCTION_SETTINGS"
    ],
    "effective_at": "2026-04-14T09:40:00Z"
  },
  "error": null,
  "meta": {
    "trace_id": "trace_10",
    "server_time": "2026-04-14T09:40:00Z"
  }
}


```
  
  
  
冻结要求：  
  
1. Save All 只保存设置中心表单型配置  
2. Save All 成功后，后端必须广播 ==settings_updated== 事件  
3. 其他在线终端收到后，必须更新 ==settings_version== 并按需补拉快照  
  
### 9.2 Publish 响应  
  
适用于：  
  
1. ==POST /api/v1/editor/publish==  
  
```
{
  "success": true,
  "data": {
    "published": true,
    "layout_version": "l_20260414_003",
    "effective_at": "2026-04-14T09:45:00Z",
    "lock_released": true
  },
  "error": null,
  "meta": {
    "trace_id": "trace_11",
    "server_time": "2026-04-14T09:45:00Z"
  }
}


```
  
  
  
冻结要求：  
  
1. Publish 必须校验版本号与锁有效性  
2. Publish 成功后必须广播 ==publish_succeeded== 事件  
  
### 9.3 版本冲突错误体  
  
```
{
  "success": false,
  "data": null,
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "版本已变化，请刷新后重试",
    "details": {
      "expected_layout_version": "l_001",
      "actual_layout_version": "l_002"
    }
  },
  "meta": {
    "trace_id": "trace_12",
    "server_time": "2026-04-14T09:46:00Z"
  }
}


```
  
  
  
补充规则：  
  
1. 设置类冲突优先返回 ==settings_version== 维度差异  
2. 发布 / 草稿类冲突优先返回 ==layout_version== 或 ==draft_version== 维度差异  
  
## 十、编辑态锁与草稿响应规范  
  
### 10.1 创建 / 获取编辑会话响应  
  
适用于：  
  
1. ==POST /api/v1/editor/sessions==  
  
```
{
  "success": true,
  "data": {
    "granted": true,
    "lease_id": "lease_001",
    "lease_expires_at": "2026-04-14T10:00:00Z",
    "heartbeat_interval_seconds": 20,
    "lock_status": "GRANTED",
    "locked_by": null,
    "draft_version": "d_001",
    "current_layout_version": "l_001"
  },
  "error": null,
  "meta": {
    "trace_id": "trace_13",
    "server_time": "2026-04-14T09:59:00Z"
  }
}


```
  
  
  
### 10.2 草稿只读响应  
  
适用于：  
  
1. ==GET /api/v1/editor/draft==  
2. 未携带 ==lease_id==  
3. ==lease_id== 不归当前终端  
4. 当前会话处于只读查看态  
  
```
{
  "success": true,
  "data": {
    "draft_exists": true,
    "draft_version": "d_001",
    "base_layout_version": "l_001",
    "lock_status": "LOCKED_BY_OTHER",
    "layout": {},
    "readonly": true
  },
  "error": null,
  "meta": {
    "trace_id": "trace_14",
    "server_time": "2026-04-14T10:01:00Z"
  }
}


```
  
  
  
### 10.3 失锁错误体  
  
适用于：  
  
1. ==POST /api/v1/editor/sessions/{lease_id}/heartbeat==  
2. ==PUT /api/v1/editor/draft==  
3. ==POST /api/v1/editor/publish==  
4. ==DELETE /api/v1/editor/draft==  
5. ==POST /api/v1/editor/sessions/{lease_id}/takeover== 的特定失效场景  
  
```
{
  "success": false,
  "data": null,
  "error": {
    "code": "DRAFT_LOCK_LOST",
    "message": "当前编辑锁已失效，请重新进入编辑态",
    "details": {
      "lease_id": "lease_001"
    }
  },
  "meta": {
    "trace_id": "trace_15",
    "server_time": "2026-04-14T10:02:00Z"
  }
}


```
  
  
  
### 10.4 被接管错误体  
  
```
{
  "success": false,
  "data": null,
  "error": {
    "code": "DRAFT_LOCK_TAKEN_OVER",
    "message": "当前草稿已被其他终端接管，已降级为只读态",
    "details": {
      "lease_id": "lease_001",
      "new_terminal_id": "terminal_b"
    }
  },
  "meta": {
    "trace_id": "trace_16",
    "server_time": "2026-04-14T10:03:00Z"
  }
}


```
  
  
---  
## 十一、读取类缓存态规范  
  
### 11.1 原则  
  
对读取类接口，缓存态优先使用：  
  
1. ==success = true==  
2. ==data.cache_mode = true==  
3. 顶层 ==error = null==  
  
不推荐把“有缓存可展示但实时数据受限”直接表现成失败外壳。  
  
### 11.2 推荐适用接口  
  
1. ==GET /api/v1/home/overview==  
2. ==GET /api/v1/home/panels/{panel_type}==  
3. ==GET /api/v1/energy==  
  
### 11.3 示例  
  
```
{
  "success": true,
  "data": {
    "cache_mode": true,
    "updated_at": "2026-04-14T10:07:00Z"
  },
  "error": null,
  "meta": {
    "trace_id": "trace_17",
    "server_time": "2026-04-14T10:07:05Z"
  }
}


```
  
  
  
### 11.4 ==CACHE_ONLY_MODE== 的使用边界  
  
==CACHE_ONLY_MODE== 作为系统运行语义保留，但当前冻结实现优先采用：  
  
1. 成功体  
2. ==data.cache_mode = true==  
  
只有在**完全无可用缓存且无法返回最小业务数据**时，才进入失败响应。  
  
---  
## 十二、文件上传响应规范  
  
### 12.1 适用接口  
  
1. ==POST /api/v1/page-assets/floorplan==  
  
### 12.2 成功示例  
  
```
{
  "success": true,
  "data": {
    "asset_updated": true,
    "asset_id": "asset_001",
    "background_image_url": "https://example.com/floorplan.png",
    "background_image_size": {
      "width": 2048,
      "height": 1536
    },
    "updated_at": "2026-04-14T10:10:00Z"
  },
  "error": null,
  "meta": {
    "trace_id": "trace_18",
    "server_time": "2026-04-14T10:10:00Z"
  }
}


```
  
  
  
### 12.3 上传失败推荐错误码  
  
上传失败优先使用：  
  
1. ==INVALID_PARAMS==  
2. ==UNAUTHORIZED==  
3. ==PIN_REQUIRED==  
4. ==PIN_LOCKED==  
  
若后续需补充文件大小、文件格式等专用错误码，可在不破坏统一外壳的前提下扩展。  
  
---  
## 十三、错误体统一规范  
  
### 13.1 顶层错误对象  
  
```
"error": {
  "code": "STRING_CODE",
  "message": "面向前端和测试可理解的错误描述",
  "details": {}
}


```
  
  
  
**13.2 字段说明**  

| 字段      | 类型             | 是否必填 | 说明      |
| ------- | -------------- | ---- | ------- |
| code    | string         | 是    | 统一错误码   |
| message | string         | 是    | 默认错误描述  |
| details | object \| null | 否    | 结构化补充信息 |
  
  
  
### 13.3 ==details== 使用原则  
  
==details== 只用于承载结构化补充信息，不用于替代 ==message==。  
  
推荐用于承载：  
  
1. 版本冲突的期望值 / 实际值  
2. 参数校验失败字段列表  
3. ==request_id== 冲突的原始语义  
4. 锁失效或被接管时的租约信息  
5. 设备控制目标不匹配时的目标字段  
  
## 十四、冻结级错误码清单  
  
### 14.1 最小错误码全集  
  
当前冻结版本最小错误码如下：  
  
1. ==INVALID_PARAMS==  
2. ==UNAUTHORIZED==  
3. ==PIN_REQUIRED==  
4. ==PIN_LOCKED==  
5. ==DEVICE_OFFLINE==  
6. ==HA_UNAVAILABLE==  
7. ==CONTROL_TIMEOUT==  
8. ==REQUEST_ID_CONFLICT==  
9. ==VERSION_CONFLICT==  
10. ==DRAFT_LOCK_LOST==  
11. ==DRAFT_LOCK_TAKEN_OVER==  
12. ==ENERGY_SOURCE_ERROR==  
13. ==CACHE_ONLY_MODE==  
14. ==UNSUPPORTED_ACTION==  
15. ==UNSUPPORTED_TARGET==  
16. ==READONLY_DEVICE==  
17. ==VALUE_OUT_OF_RANGE==  
  
### 14.2 关键使用边界  
  
### ==CONTROL_TIMEOUT==  
  
仅用于：  
  
1. ==GET /api/v1/device-controls/{request_id}== 的 ==data.error_code==  
2. 对应 WebSocket 控制结果事件中的业务失败载荷  
  
不用于：  
  
1. ==POST /api/v1/device-controls== 的同步顶层错误码  
  
### ==REQUEST_ID_CONFLICT==  
  
仅当相同 ==request_id== 被用于**语义不同**的请求载荷时返回。  
  
同一请求重放不返回该错误，而应返回原结果。  
  
### ==READONLY_DEVICE==  
  
仅用于设备被定义为只读设备，且控制请求在入口层被直接阻断的场景。  
  
### ==UNSUPPORTED_ACTION==  
  
用于：  
  
1. ==action_type== 不受当前设备能力支持  
  
### ==UNSUPPORTED_TARGET==  
  
用于：  
  
1. ==target_scope==  
2. ==target_key==  
  
与设备能力不匹配的场景。  
  
### ==VALUE_OUT_OF_RANGE==  
  
用于：  
  
1. 数值型控制请求超出冻结值域  
2. 单位 / 步进不满足冻结控制模式要求的场景  
  
## 十五、参数校验错误规范  
  
### 15.1 推荐格式  
  
```
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_PARAMS",
    "message": "请求参数不合法",
    "details": {
      "fields": [
        {
          "field": "device_id",
          "reason": "required"
        },
        {
          "field": "action_type",
          "reason": "unsupported_enum"
        }
      ]
    }
  },
  "meta": {
    "trace_id": "trace_19",
    "server_time": "2026-04-14T10:05:00Z"
  }
}


```
  
  
  
### 15.2 原则  
  
1. 字段级错误尽量进入 ==details.fields==  
2. ==message== 保持通用可读  
3. 前端可根据 ==fields== 做表单定位或高亮提示  
  
## 十六、冲突类错误规范  
  
### 16.1 ==REQUEST_ID_CONFLICT==  
  
```
{
  "success": false,
  "data": null,
  "error": {
    "code": "REQUEST_ID_CONFLICT",
    "message": "相同 request_id 已用于其他语义请求",
    "details": {
      "request_id": "req_001",
      "original_action_type": "SET_POWER_STATE",
      "original_target_device_id": "dev_001",
      "conflict_reason": "payload_not_match"
    }
  },
  "meta": {
    "trace_id": "trace_20",
    "server_time": "2026-04-14T10:06:00Z"
  }
}


```
  
  
  
### 16.2 ==VERSION_CONFLICT==  
  
适用于：  
  
1. ==PUT /api/v1/settings==  
2. ==PUT /api/v1/editor/draft==  
3. ==POST /api/v1/editor/publish==  
4. ==POST /api/v1/system/backups/{backup_id}/restore==  
  
建议始终返回结构化版本差异。  
  
### 16.3 ==DRAFT_LOCK_LOST== 与 ==DRAFT_LOCK_TAKEN_OVER==  
  
编辑态相关接口命中锁冲突时，必须使用：  
  
1. ==DRAFT_LOCK_LOST==  
2. ==DRAFT_LOCK_TAKEN_OVER==  
  
不得以笼统的 ==UNAUTHORIZED== 或 ==VERSION_CONFLICT== 代替锁语义。  
  
---  
## 十七、WebSocket 事件外壳规范  
  
### 17.1 顶层结构  

连接鉴权补充：

1. 统一采用 `Authorization: Bearer <access_token>` 语义。
2. 受限终端可用等价方式传递 `access_token`。
3. `home_id / terminal_id` 的权威来源为 `access_token` claim；若通过查询参数或其他兼容字段传递，仅用于兼容传输或诊断定位，且必须与 claim 一致。
4. 重连时客户端可携带 `last_event_id` 请求增量补偿；详细规则见《家庭智能中控 Web App 鉴权方案说明 v2.4.1》与《家庭智能中控 Web App WebSocket 事件契约 v2.4.1》。
  
```
{
  "event_id": "evt_001",
  "event_type": "device_state_changed",
  "occurred_at": "2026-04-14T10:12:00Z",
  "sequence": 101,
  "home_id": "home_001",
  "change_domain": "DEVICE_STATE",
  "snapshot_required": false,
  "payload": {}
}


```
  
  
  
**17.2 必填字段**  

| 字段                | 说明           |
| ----------------- | ------------ |
| event_id          | 事件唯一 ID      |
| event_type        | 事件类型         |
| occurred_at       | 事件发生时间       |
| sequence          | 当前连接内顺序号     |
| home_id           | 家庭标识         |
| change_domain     | 变更域          |
| snapshot_required | 是否要求前端立即补拉快照 |
| payload           | 事件业务载荷       |
  
  
  
### 17.3 ==change_domain== 冻结枚举  
  
1. ==DEVICE_STATE==  
2. ==SUMMARY==  
3. ==SETTINGS==  
4. ==LAYOUT==  
5. ==EDITOR_LOCK==  
6. ==ENERGY==  
7. ==MEDIA==  
8. ==BACKUP==  
  
### 17.4 最小事件清单  
  
1. ==device_state_changed==  
2. ==summary_updated==  
3. ==settings_updated==  
4. ==publish_succeeded==  
5. ==draft_lock_acquired==  
6. ==draft_lock_lost==  
7. ==draft_taken_over==  
8. ==version_conflict_detected==  
9. ==energy_refresh_completed==  
10. ==energy_refresh_failed==  
11. ==media_state_changed==  
12. ==backup_restore_completed==  
13. ==ha_sync_degraded==  
14. ==ha_sync_recovered==  
  
### 17.5 ==sequence== 规则  
  
1. ==sequence== 仅在当前 WebSocket 连接内有效  
2. 断线重连后，不要求新连接继续与旧连接 ==sequence== 比较  
3. 重连时客户端应优先携带 ==last_event_id==，服务端先尝试增量回放  
4. 若 ==last_event_id== 失效、事件窗口缺失或 ==snapshot_required = true==，前端立即补拉快照  
5. 若当前连接内检测到 ==sequence== 不连续，前端应进入补偿流程  
  
### 17.6 配置版本与恢复事件载荷  
  
### ==settings_updated==  
  
用于 Save All 成功后的全端同步。  
  
==payload== 至少包含：  
  
1. ==settings_version==  
2. ==updated_domains==  
3. ==effective_at==  
  
推荐：  
  
1. ==snapshot_required = true==  
  
### ==publish_succeeded==  
  
用于 Publish 成功后的全端同步。  
  
==payload== 至少包含：  
  
1. ==layout_version==  
2. ==effective_at==  
3. ==published_by_terminal_id==  
  
推荐：  
  
1. ==snapshot_required = true==  
  
### ==backup_restore_completed==  
  
用于恢复备份成功后的全端同步。  
  
==payload== 至少包含：  
  
1. ==backup_id==  
2. ==settings_version==  
3. ==layout_version==  
4. ==effective_at==  
5. ==restored_by_terminal_id==  
  
推荐：  
  
1. ==change_domain = BACKUP==  
2. ==snapshot_required = true==  
  
### 17.7 控制相关状态事件载荷  
  
当 ==device_state_changed== 或 ==media_state_changed== 与某次控制请求相关时，==payload== 必须包含：  
  
1. ==device_id==  
2. ==related_request_id==  
3. ==confirmation_type==  
4. ==execution_status==  
5. ==runtime_state==  
6. ==error_code==  
7. ==error_message==  
  
补充规则：  
  
1. ==related_request_id== 在**控制相关状态事件**中为冻结必填字段  
2. 若事件并非由控制请求触发，则 ==related_request_id== 可省略  
3. 控制最终结果口径应与 ==GET /api/v1/device-controls/{request_id}== 保持一致  
  
### 17.8 编辑锁事件载荷  
  
### ==draft_lock_acquired==  
  
==payload== 至少包含：  
  
1. ==lease_id==  
2. ==terminal_id==  
3. ==lease_expires_at==  
  
### ==draft_lock_lost==  
  
==payload== 至少包含：  
  
1. ==lease_id==  
2. ==terminal_id==  
3. ==lost_reason==  
  
==lost_reason== 取值：  
  
1. ==LEASE_EXPIRED==  
2. ==TAKEN_OVER==  
  
### ==draft_taken_over==  
  
==payload== 至少包含：  
  
1. ==previous_terminal_id==  
2. ==new_terminal_id==  
3. ==new_operator_id==  
4. ==new_lease_id==  
5. ==draft_version==  
  
### 17.9 建议补拉接口  
  
当出现重连且增量补偿失败、==snapshot_required = true== 或序列异常时，建议前端补拉：  
  
1. 首页：==GET /api/v1/home/overview==  
2. 设置中心：==GET /api/v1/settings==  
3. 编辑态：==GET /api/v1/editor/draft==  
4. 电量：==GET /api/v1/energy==  
5. 音乐：==GET /api/v1/media/default==  
  
## 十八、HTTP 状态码建议  
  
**18.1 推荐约定**  

| 场景                   | 建议状态码                   |
| -------------------- | ----------------------- |
| 读取成功                 | 200 OK                  |
| 保存成功                 | 200 OK                  |
| 创建成功                 | 201 Created             |
| 控制受理成功               | 202 Accepted            |
| 参数错误                 | 400 Bad Request         |
| 未登录 / 未授权            | 401 Unauthorized        |
| 需要 PIN 验证            | 403 Forbidden           |
| 资源不存在                | 404 Not Found           |
| 版本冲突 / request_id 冲突 | 409 Conflict            |
| 服务不可用                | 503 Service Unavailable |
  
  
  
### 18.2 当前项目推荐  
  
1. ==POST /api/v1/device-controls== 受理成功推荐使用 ==202 Accepted==  
2. ==PIN_REQUIRED== 统一使用 ==403 Forbidden + error.code = PIN_REQUIRED==  
3. ==REQUEST_ID_CONFLICT==、==VERSION_CONFLICT== 优先使用 ==409 Conflict==  
4. 所有非 2xx 响应仍返回统一错误体外壳  
  
## 十九、待实现阶段确认项  
  
以下内容不阻塞本规范落地，但建议在后端实现阶段统一确认：  
  
1. ==trace_id== 的生成来源与透传链路  
2. ==meta.server_time== 是否统一由网关层注入  
3. ==error.details== 的最大返回粒度与脱敏规则  
4. 文件上传接口是否额外返回文件 hash  
5. WebSocket 事件是否需要携带与 HTTP 侧可关联的可选追踪字段  
  
## 二十、联调使用建议  
  
前后端联调时建议按以下顺序校验：  
  
1. 先校验响应外壳是否统一  
2. 再校验业务字段是否符合接口清单  
3. 测试用例同时断言：  
    - HTTP 状态码  
    - ==success==  
    - ==error.code==  
    - 关键业务状态字段  
4. 对控制链路严格区分：  
    - 受理成功  
    - 最终执行成功  
    - 最终执行失败  
5. 对读取类接口，单独覆盖缓存态测试：  
    - ==success = true==  
    - ==data.cache_mode = true==  
    - 控制能力受限但页面可展示  
  
  
## 二十一、结论  
  
《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》严格基于《家庭智能中控 Web App PRD v2.4》与《家庭智能中控 Web App 接口清单 v2.4》完成收口。  
  
本版重点完成了以下对齐：  
  
1. 控制统一走 ==POST /api/v1/device-controls==  
2. 控制结果统一走 ==GET /api/v1/device-controls/{request_id}==  
3. Save All、Publish、备份恢复的同步事件分别冻结为 ==settings_updated==、==publish_succeeded==、==backup_restore_completed==  
4. 首页总览聚合内容统一归属 ==sidebar==  
5. 默认媒体设备状态拆分为 ==binding_status== 与 ==availability_status==  
6. 列表接口只统一外壳与分页结构，不强行统一业务字段名  
7. 读取类缓存态默认使用成功响应表达  
8. 控制相关 WebSocket 事件补齐 ==related_request_id== 冻结要求  
  
该版本可直接作为后端实现、前端联调、测试断言与后续数据库模型继续对齐的统一返回契约基线。  
