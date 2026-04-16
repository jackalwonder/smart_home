# 《家庭智能中控 Web App 接口清单 v2.4》  
  
## 一、文档信息  
  
- **文档名称**：家庭智能中控 Web App 接口清单 v2.4  
- **文档类型**：正式接口清单文档  
- **适用对象**：前端、后端、测试、运维、Codex 任务拆解  
- **基线文档**：  
    - 《家庭智能中控 Web App PRD v2.4》  
    - 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》  
- **版本状态**：已冻结  
- **编制日期**：2026-04-14  
- **版本定位**：在 v2.3.5 基础上完成冻结前一致性修订的正式接口契约版  
  
### 1.1 版本说明  
  
本版本严格以 PRD v2.4 为唯一产品基线，在 v2.3.5 接口清单基础上完成以下一致性修订：  
  
1. 统一 ==GET /api/v1/home/overview== 的返回层级：时间、天气、音乐卡片、全屋摘要统一收口到 ==sidebar==。  
2. 将默认媒体设备的“是否已绑定”与“在线可用状态”拆分为两个字段：==binding_status== 与 ==availability_status==。  
3. 补齐备份恢复后的全端同步闭环，新增冻结事件 ==backup_restore_completed==。  
4. 将 ==settings_updated==、==publish_succeeded==、==backup_restore_completed== 三类版本同步事件统一纳入最小 WebSocket 事件清单。  
5. 移除 ==GET /api/v1/auth/session== 中与统一外壳重复的 ==server_time== 业务字段，统一以 ==meta.server_time== 为准。  
6. 明确所有 HTTP / WebSocket 外层结构统一遵循《统一响应体与错误体规范 v2.4》，本清单只定义业务字段与业务语义。  
  
---  
  
## 二、接口设计总原则  
  
### 2.1 命名约定  
  
PRD 中的 camelCase 概念在接口 wire format 中统一使用 snake_case。  
  
例如：  
  
- ==requestId== -> ==request_id==  
- ==defaultControlTarget== -> ==default_control_target==  
- ==confirmationType== -> ==confirmation_type==  
- ==layoutVersion== -> ==layout_version==  
- ==settingsVersion== -> ==settings_version==  
  
### 2.2 真源原则  
  
1. 前端只连接自有后端。  
2. 后端是配置、映射、状态、聚合、控制、推送的唯一业务边界。  
3. 前端本地缓存不是业务真源，仅用于受限态展示。  
  
### 2.3 统一响应体原则  
  
1. 所有 HTTP 接口统一遵循《统一响应体与错误体规范》。  
2. 统一外壳为：  
    - ==success==  
    - ==data==  
    - ==error==  
    - ==meta.trace_id==  
    - ==meta.server_time==  
3. 本文档的“返回字段”仅描述 ==data== 内业务字段，不再重复定义统一外壳。  
4. 读取类接口的缓存态默认作为成功响应中的运行语义表达，不作为默认失败外壳。  
  
### 2.4 控制原则  
  
1. 所有控制请求必须携带 ==request_id==。  
2. 所有控制接口必须使用统一 ==action_type + payload== 模型。  
3. 不得再以灯光、空调、窗帘、音乐的设备特异性动作枚举作为正式契约。  
4. 最终控制成功与否由 ==confirmation_type== 对应的状态确认规则决定。  
5. 自动重试仅由后端执行；前端不得在超时前自行重发同一控制请求。  
  
### 2.5 设备模型原则  
  
所有展示、控制、统计、摘要、收藏、热点绑定，统一以业务设备 ==device== 为最小单位。  
  
不得直接以前端消费 HA 原始实体数量和原始实体动作语义。  
  
### 2.6 版本同步原则  
  
1. 表单型配置变更使用 ==settings_version==。  
2. 主舞台结构型发布使用 ==layout_version==。  
3. Save All 与 Publish 必须彻底分离，不得共用写入口。  
4. Save All 成功后必须通过 WebSocket 推送所有在线终端。  
5. Publish 成功后必须通过 WebSocket 推送所有在线终端。  
6. 备份恢复成功后必须通过 WebSocket 推送所有在线终端。  
---  
## 三、冻结级枚举与通用字段  
  
### 3.1 通用动作模型  
  
所有控制请求统一使用：  
  
### ==action_type==  
  
- ==TOGGLE_POWER==  
- ==SET_POWER_STATE==  
- ==SET_MODE==  
- ==SET_VALUE==  
- ==SET_TEMPERATURE==  
- ==SET_POSITION==  
- ==EXECUTE_ACTION==  
  
### ==payload==  
  
- ==target_scope: string | null==  
- ==target_key: string | null==  
- ==value: string | number | boolean | object | null==  
- ==unit: string | null==  
  
### 3.2 控制确认类型 ==confirmation_type==  
  
- ==ACK_DRIVEN==  
- ==TARGET_STATE_DRIVEN==  
- ==PLAYBACK_STATE_DRIVEN==  
  
### 3.3 设备入口行为 ==entry_behavior==  
  
- ==QUICK_ACTION==  
- ==OPEN_CONTROL_CARD==  
- ==OPEN_MEDIA_POPUP==  
- ==OPEN_COMPLEX_CARD==  
- ==OPEN_READONLY_CARD==  
- ==DISABLED_OFFLINE==  
  
### 3.4 控制状态 ==execution_status==  
  
- ==PENDING==  
- ==ACK_SUCCESS==  
- ==SUCCESS==  
- ==RECONCILING==  
- ==FAILED==  
- ==TIMEOUT==  
- ==STATE_MISMATCH==  
  
### 3.5 设备冻结字段  
  
适用的读接口中，统一补充以下字段：  
  
- ==is_complex_device: boolean==  
- ==is_readonly_device: boolean==  
- ==confirmation_type: enum | null==  
- ==entry_behavior: enum==  
- ==default_control_target: string | null==  
- ==alert_badges: array==  
- ==control_schema: array==  
- ==capabilities: object==  
  
### 3.6 ==alert_badges[]== 最小字段结构  
  
- ==code: string==  
- ==level: string==  
- ==text: string==  
  
### 3.7 ==control_schema[]== 冻结字段  
  
- ==action_type==  
- ==target_scope==  
- ==target_key==  
- ==value_type==  
- ==value_range==  
- ==allowed_values==  
- ==unit==  
- ==is_quick_action==  
- ==requires_detail_entry==  
  
### 3.8 ==control_schema.value_range== 冻结结构  
  
当控件存在数值范围时，统一表达为：  
  
```
{
  "min": 0,
  "max": 100,
  "step": 1
}

```
  
  
### 3.9 ==position_device_summary== 冻结结构  
  
首页摘要及相关统计中，位置型设备摘要统一表达为：  
  
- ==opened_count==  
- ==closed_count==  
- ==partial_count==  
---  
****四、接口总表****  

| 分类 | 接口名称 | Method | Path | 页面/模块 | 备注 |
| ----- | --------------- | ------ | ---------------------------------------------- | ------------------- | ----------------- |
| 认证/会话 | 获取当前会话 | GET | /api/v1/auth/session | 全局启动、路由守卫 | 固定家庭账号 |
| 认证/会话 | PIN 验证 | POST | /api/v1/auth/pin/verify | 设置中心、编辑态入口 | 管理操作前置 |
| 认证/会话 | 获取 PIN 会话状态 | GET | /api/v1/auth/pin/session | 设置中心、编辑态 | 判断是否免验 |
| 首页总览 | 获取首页总览数据 | GET | /api/v1/home/overview | 首页 | 主舞台、摘要、快捷入口、电量、音乐 |
| 首页总览 | 获取首页浮层数据 | GET | /api/v1/home/panels/{panel_type} | 灯光/空调/低电量/离线/常用设备弹窗 | 本期无复杂设备独立固定面板 |
| 房间与设备 | 获取房间列表 | GET | /api/v1/rooms | 编辑态、设置中心 | 房间清单 |
| 房间与设备 | 获取设备列表 | GET | /api/v1/devices | 设置中心、编辑态、设备列表 | 支持筛选 |
| 房间与设备 | 获取单设备详情 | GET | /api/v1/devices/{device_id} | 控制卡片、复杂/只读卡片 | 包含冻结字段 |
| 控制 | 发起单设备控制 | POST | /api/v1/device-controls | 首页、卡片、弹窗 | 统一控制入口 |
| 控制 | 查询控制结果 | GET | /api/v1/device-controls/{request_id} | 前端补偿、测试 | 最终结果查询 |
| 设置中心 | 获取设置中心配置 | GET | /api/v1/settings | 设置中心 | 聚合读取 |
| 设置中心 | Save All 保存表单配置 | PUT | /api/v1/settings | 设置中心 | 不含舞台结构 |
| 系统设置 | 获取系统连接配置 | GET | /api/v1/system-connections | 系统设置 | HA 连接状态 |
| 系统设置 | 保存系统连接配置 | PUT | /api/v1/system-connections/home-assistant | 系统设置 | 需 PIN |
| 系统设置 | 测试系统连接 | POST | /api/v1/system-connections/home-assistant/test | 系统设置 | 即时动作 |
| 系统设置 | 重新拉取设备列表 | POST | /api/v1/devices/reload | 系统设置 | 即时动作 |
| 功能设置 | 获取功能设置 | GET | /api/v1/function-settings | 功能设置 | 独立读取 |
| 常用设备 | 获取常用设备配置 | GET | /api/v1/favorites | 常用设备页、首页常用设备弹窗 | 含排序 |
| 页面设置 | 获取页面设置 | GET | /api/v1/page-settings | 页面设置 | 独立读取 |
| 编辑态 | 创建/获取编辑会话 | POST | /api/v1/editor/sessions | 进入编辑态 | 获取/占用 lease |
| 编辑态 | 查询当前草稿 | GET | /api/v1/editor/draft | 编辑态 | 只读/编辑预览 |
| 编辑态 | 续租编辑锁 | POST | /api/v1/editor/sessions/{lease_id}/heartbeat | 编辑态 | 每 20s |
| 编辑态 | 强制接管编辑锁 | POST | /api/v1/editor/sessions/{lease_id}/takeover | 编辑冲突弹窗 | 强制接管 |
| 编辑态 | 更新草稿 | PUT | /api/v1/editor/draft | 编辑态 | 当前终端预览 |
| 编辑态 | 发布草稿 | POST | /api/v1/editor/publish | 编辑态 | 生成正式版本 |
| 编辑态 | 放弃草稿/退出编辑 | DELETE | /api/v1/editor/draft | 编辑态退出 | 丢弃未发布变更 |
| 电量 | 获取电量信息 | GET | /api/v1/energy | 首页电量条、系统设置 | 状态/缓存/异常 |
| 电量 | 保存电量绑定 | PUT | /api/v1/energy/binding | 系统设置 | 独立动作 |
| 电量 | 解绑电量绑定 | DELETE | /api/v1/energy/binding | 系统设置 | 独立动作 |
| 电量 | 手动刷新电量 | POST | /api/v1/energy/refresh | 系统设置 | 即时动作 |
| 媒体 | 获取默认媒体卡片数据 | GET | /api/v1/media/default | 首页音乐卡片 | 单一默认媒体设备 |
| 媒体 | 保存默认媒体设备绑定 | PUT | /api/v1/media/default/binding | 系统设置 | 手动指定唯一默认媒体设备 |
| 媒体 | 解绑默认媒体设备绑定 | DELETE | /api/v1/media/default/binding | 系统设置 | 恢复为未指定态 |
| 页面资源 | 上传或替换户型底图 | POST | /api/v1/page-assets/floorplan | 页面设置、初始化 | 管理动作 |
| 设备映射 | 保存设备映射修正 | PUT | /api/v1/device-mappings/{device_id} | 初始化流程/后台 | 房间、类型、主设备、默认聚焦区 |
| 备份恢复 | 触发手动备份 | POST | /api/v1/system/backups | 系统设置/后台 | 手动备份 |
| 备份恢复 | 获取备份列表 | GET | /api/v1/system/backups | 系统设置/后台 | 备份清单 |
| 备份恢复 | 恢复备份 | POST | /api/v1/system/backups/{backup_id}/restore | 系统设置/后台 | 恢复并生成新正式版本 |
| 实时推送 | WebSocket 连接 | WS | /ws | 全局 | 状态、版本、锁、电量、媒体 |
  
---  
## 五、分接口详细定义  
  
### 5.1 认证与会话  
  
### 1. 获取当前会话  
  
- **Method**：==GET==  
- **Path**：==/api/v1/auth/session==  
  
**返回字段**  
  
- ==home_id==  
- ==operator_id==  
- ==terminal_id==  
- ==login_mode==  
- ==terminal_mode==  
- ==pin_session_active==  
- ==pin_session_expires_at==  
- ==features==  
    - ==music_enabled==  
    - ==energy_enabled==  
    - ==editor_enabled==  
  
**枚举**  
  
- ==login_mode==  
    - ==FIXED_HOME_ACCOUNT==  
- ==terminal_mode==  
    - ==KIOSK==  
    - ==DESKTOP==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
---  
### 2. PIN 验证  
  
- **Method**：==POST==  
- **Path**：==/api/v1/auth/pin/verify==  
  
**请求字段**  
  
- ==pin==  
- ==target_action==  
- ==terminal_id==  
  
**==target_action== 取值**  
  
- ==ENTER_SETTINGS==  
- ==ENTER_EDITOR==  
- ==SAVE_SYSTEM_CONNECTION==  
- ==TEST_SYSTEM_CONNECTION==  
- ==SAVE_ENERGY_BINDING==  
- ==UNBIND_ENERGY_BINDING==  
- ==PUBLISH_DRAFT==  
- ==RESTORE_BACKUP==  
- ==RELOAD_DEVICES==  
- ==SAVE_DEFAULT_MEDIA_BINDING==  
- ==UNBIND_DEFAULT_MEDIA_BINDING==  
  
**返回字段**  
  
- ==verified==  
- ==pin_session_active==  
- ==pin_session_expires_at==  
- ==remaining_attempts==  
- ==lock_until==  
  
**错误码**  
  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==UNAUTHORIZED==  
---  
### 3. 获取 PIN 会话状态  
  
- **Method**：==GET==  
- **Path**：==/api/v1/auth/pin/session==  
  
**返回字段**  
  
- ==pin_session_active==  
- ==pin_session_expires_at==  
- ==remaining_lock_seconds==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
---  
### 5.2 首页总览与浮层  
  
### 4. 获取首页总览数据  
  
- **Method**：==GET==  
- **Path**：==/api/v1/home/overview==  
  
**请求参数**  
  
- ==layout_version==：可选  
- ==settings_version==：可选  
- ==terminal_mode==：可选  
  
**返回字段**  
  
- ==home_info==  
    - ==home_id==  
- ==layout_version==  
- ==settings_version==  
- ==stage==  
- ==sidebar==  
    - ==datetime==  
    - ==weather==  
    - ==music_card==  
    - ==summary==  
- ==quick_entries==  
- ==energy_bar==  
- ==system_state==  
- ==cache_mode==  
- ==ui_policy==  
  
**==stage== 字段**  
  
- ==background_image_url==  
- ==background_image_size==  
- ==hotspots==  
  
**==stage.hotspots[]== 冻结字段**  
  
- ==hotspot_id==  
- ==device_id==  
- ==display_name==  
- ==device_type==  
- ==x==  
- ==y==  
- ==icon_type==  
- ==status==  
- ==is_offline==  
- ==is_complex_device==  
- ==is_readonly_device==  
- ==entry_behavior==  
- ==alert_badges==  
- ==status_summary==  
- ==default_control_target==  
- ==display_policy==  
  
**==display_policy== 取值**  
  
- ==ICON_ONLY==  
- ==LIGHT_SUMMARY==  
- ==ALERT_PRIORITY==  
  
**==sidebar.summary== 建议字段**  
  
- ==online_count==  
- ==offline_count==  
- ==lights_on_count==  
- ==running_device_count==  
- ==position_device_summary==  
    - ==opened_count==  
    - ==closed_count==  
    - ==partial_count==  
- ==low_battery_count==  
  
**==sidebar.music_card== 建议字段**  
  
- ==binding_status==  
- ==availability_status==  
- ==device_id==  
- ==display_name==  
- ==play_state==  
- ==track_title==  
- ==artist==  
- ==entry_behavior==  
  
**缓存态表达**  
  
- ==cache_mode = true== 时表示后端返回缓存快照  
- 缓存态仍属于成功响应  
  
**错误码**  
  
- ==UNAUTHORIZED==  
---  
### 5. 获取首页浮层数据  
  
- **Method**：==GET==  
- **Path**：==/api/v1/home/panels/{panel_type}==  
  
**路径参数**  
  
- ==panel_type==  
  
**==panel_type== 取值**  
  
- ==LIGHTS==  
- ==ACS==  
- ==LOW_BATTERY==  
- ==OFFLINE==  
- ==FAVORITES==  
  
**请求参数**  
  
- ==room_id==：可选  
- ==page==：可选  
- ==page_size==：可选  
  
**返回字段**  
  
- ==panel_type==  
- ==title==  
- ==items==  
- ==summary==  
- ==cache_mode==  
  
**==items[]== 通用字段**  
  
- ==device_id==  
- ==display_name==  
- ==device_type==  
- ==room_id==  
- ==room_name==  
- ==status==  
- ==is_offline==  
- ==is_complex_device==  
- ==is_readonly_device==  
- ==entry_behavior==  
- ==confirmation_type==  
- ==alert_badges==  
  
**==FAVORITES== 额外字段**  
  
- ==favorite_order==  
- ==is_selectable==  
- ==exclude_reason==：可选  
  
**边界规则**  
  
- 当前阶段不提供复杂设备独立固定面板。  
- 只读设备默认不进入 ==FAVORITES== 默认候选。  
- 离线设备优先于低电量；离线设备不进入低电量集合。  
---  
### 5.3 房间与设备  
  
### 6. 获取房间列表  
  
- **Method**：==GET==  
- **Path**：==/api/v1/rooms==  
  
**请求参数**  
  
- ==include_counts==：默认 ==true==  
  
**返回字段**  
  
- ==rooms==  
  
**==rooms[]== 字段**  
  
- ==room_id==  
- ==room_name==  
- ==priority==  
- ==device_count==  
- ==homepage_device_count==  
- ==visible_in_editor==  
---  
### 7. 获取设备列表  
  
- **Method**：==GET==  
- **Path**：==/api/v1/devices==  
  
**请求参数**  
  
- ==room_id==  
- ==device_type==  
- ==status==  
- ==keyword==  
- ==only_homepage_candidate==  
- ==only_favorite_candidate==  
- ==page==  
- ==page_size==  
  
**返回字段**  
  
- ==items==  
- ==page_info==  
  
**==items[]== 冻结字段**  
  
- ==device_id==  
- ==display_name==  
- ==raw_name==  
- ==device_type==  
- ==room_id==  
- ==room_name==  
- ==status==  
- ==is_offline==  
- ==is_complex_device==  
- ==is_readonly_device==  
- ==confirmation_type==  
- ==entry_behavior==  
- ==default_control_target==  
- ==is_homepage_visible==  
- ==is_primary_device==  
- ==is_favorite==  
- ==favorite_order==  
- ==is_favorite_candidate==  
- ==favorite_exclude_reason==  
- ==capabilities==  
- ==alert_badges==  
- ==status_summary==  
  
**候选边界**  
  
- 默认媒体设备不作为常用设备默认候选。  
- 只读设备默认 ==is_favorite_candidate = false==。  
---  
### 8. 获取单设备详情  
  
- **Method**：==GET==  
- **Path**：==/api/v1/devices/{device_id}==  
  
**请求参数**  
  
- ==include_runtime_fields==：默认 ==true==  
- ==include_editor_fields==：可选  
  
**返回字段**  
  
- ==device_id==  
- ==display_name==  
- ==raw_name==  
- ==device_type==  
- ==room_id==  
- ==room_name==  
- ==status==  
- ==is_offline==  
- ==is_complex_device==  
- ==is_readonly_device==  
- ==confirmation_type==  
- ==entry_behavior==  
- ==default_control_target==  
- ==capabilities==  
- ==alert_badges==  
- ==status_summary==  
- ==runtime_state==  
- ==control_schema==  
- ==editor_config==  
- ==source_info==  
  
**==runtime_state== 建议字段**  
  
- ==last_state_update_at==  
- ==aggregated_state==  
- ==aggregated_mode==  
- ==aggregated_position==  
- ==telemetry==  
- ==alerts==  
  
**==control_schema[]== 冻结字段**  
  
- ==action_type==  
- ==target_scope==  
- ==target_key==  
- ==value_type==  
- ==value_range==  
- ==allowed_values==  
- ==unit==  
- ==is_quick_action==  
- ==requires_detail_entry==  
  
**只读设备规则**  
  
- 若 ==is_readonly_device = true==，则 ==control_schema = []==。  
- 只读设备不得返回可执行控制区配置。  
---  
### 5.4 控制  
  
### 9. 发起单设备控制  
  
- **Method**：==POST==  
- **Path**：==/api/v1/device-controls==  
  
**请求字段**  
  
- ==request_id==：必填  
- ==device_id==：必填  
- ==action_type==：必填  
- ==payload==  
    - ==target_scope==  
    - ==target_key==  
    - ==value==  
    - ==unit==  
- ==client_ts==：可选  
  
**==action_type== 取值**  
  
- ==TOGGLE_POWER==  
- ==SET_POWER_STATE==  
- ==SET_MODE==  
- ==SET_VALUE==  
- ==SET_TEMPERATURE==  
- ==SET_POSITION==  
- ==EXECUTE_ACTION==  
  
**返回字段**  
  
- ==request_id==  
- ==device_id==  
- ==accepted==  
- ==acceptance_status==  
- ==confirmation_type==  
- ==accepted_at==  
- ==timeout_seconds==  
- ==retry_scheduled==  
- ==message==  
- ==result_query_path==  
  
**==acceptance_status== 取值**  
  
- ==ACCEPTED==  
- ==REJECTED==  
  
**错误码**  
  
- ==INVALID_PARAMS==  
- ==UNAUTHORIZED==  
- ==DEVICE_OFFLINE==  
- ==HA_UNAVAILABLE==  
- ==REQUEST_ID_CONFLICT==  
- ==UNSUPPORTED_ACTION==  
- ==UNSUPPORTED_TARGET==  
- ==READONLY_DEVICE==  
- ==VALUE_OUT_OF_RANGE==  
  
**幂等规则**  
  
- ==request_id== 家庭级全局唯一。  
- 幂等窗口 10 分钟。  
- 相同 ==request_id== + 相同语义：返回原结果。  
- 相同 ==request_id== + 不同语义：返回 ==REQUEST_ID_CONFLICT==。  
---  
### 10. 查询控制结果  
  
- **Method**：==GET==  
- **Path**：==/api/v1/device-controls/{request_id}==  
  
**返回字段**  
  
- ==request_id==  
- ==device_id==  
- ==action_type==  
- ==payload==  
- ==acceptance_status==  
- ==confirmation_type==  
- ==execution_status==  
- ==retry_count==  
- ==accepted_at==  
- ==completed_at==  
- ==final_runtime_state==  
- ==error_code==  
- ==error_message==  
  
**==execution_status== 取值**  
  
- ==PENDING==  
- ==ACK_SUCCESS==  
- ==SUCCESS==  
- ==RECONCILING==  
- ==FAILED==  
- ==TIMEOUT==  
- ==STATE_MISMATCH==  
  
**说明**  
  
- ==CONTROL_TIMEOUT== 仅出现在本接口结果或对应 WS 最终事件中。  
- 不应出现在控制受理接口的同步错误体中。  
---  
### 5.5 设置中心  
  
### 11. 获取设置中心配置  
  
- **Method**：==GET==  
- **Path**：==/api/v1/settings==  
  
**返回字段**  
  
- ==favorites==  
- ==page_settings==  
- ==function_settings==  
- ==system_settings_summary==  
- ==settings_version==  
- ==pin_session_required==  
---  
### 12. Save All 保存表单配置  
  
- **Method**：==PUT==  
- **Path**：==/api/v1/settings==  
  
**请求字段**  
  
- ==settings_version==  
- ==favorites==：可选  
- ==page_settings==：可选  
- ==function_settings==：可选  
  
**规则**  
  
- 不接受舞台结构字段。  
- 不接受热点坐标、布点、主舞台布局字段。  
- 仅保存设置中心表单型配置。  
  
**返回字段**  
  
- ==saved==  
- ==settings_version==  
- ==updated_domains==  
- ==effective_at==  
  
**==updated_domains== 取值**  
  
- ==FAVORITES==  
- ==PAGE_SETTINGS==  
- ==FUNCTION_SETTINGS==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==INVALID_PARAMS==  
- ==VERSION_CONFLICT==  
  
**同步要求**  
  
- 保存成功后，后端必须广播 ==settings_updated== 事件。  
- 其他在线终端收到事件后必须更新 ==settings_version== 并按需补拉快照。  
---  
### 5.6 系统设置  
  
### 13. 获取系统连接配置  
  
- **Method**：==GET==  
- **Path**：==/api/v1/system-connections==  
  
**返回字段**  
  
- ==home_assistant==  
    - ==connection_mode==  
    - ==base_url_masked==  
    - ==auth_configured==  
    - ==connection_status==  
    - ==last_test_at==  
    - ==last_test_result==  
    - ==last_sync_at==  
    - ==last_sync_result==  
- ==settings_version==  
  
**==connection_status== 取值**  
  
- ==CONNECTED==  
- ==DISCONNECTED==  
- ==DEGRADED==  
---  
### 14. 保存系统连接配置  
  
- **Method**：==PUT==  
- **Path**：==/api/v1/system-connections/home-assistant==  
  
**请求字段**  
  
- ==base_url==  
- ==auth_payload==  
- ==operator_id==  
- ==terminal_id==  
  
**返回字段**  
  
- ==saved==  
- ==connection_status==  
- ==updated_at==  
- ==message==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==INVALID_PARAMS==  
---  
### 15. 测试系统连接  
  
- **Method**：==POST==  
- **Path**：==/api/v1/system-connections/home-assistant/test==  
  
**请求字段**  
  
- ==use_saved_config==  
- ==candidate_config==：可选  
  
**返回字段**  
  
- ==tested==  
- ==connection_status==  
- ==latency_ms==  
- ==tested_at==  
- ==message==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==INVALID_PARAMS==  
---  
### 16. 重新拉取设备列表  
  
- **Method**：==POST==  
- **Path**：==/api/v1/devices/reload==  
  
**请求字段**  
  
- ==force_full_sync==：默认 ==false==  
  
**返回字段**  
  
- ==accepted==  
- ==reload_status==  
- ==started_at==  
- ==message==  
  
**==reload_status== 取值**  
  
- ==ACCEPTED==  
- ==REJECTED==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==HA_UNAVAILABLE==  
---  
### 5.7 功能设置 / 常用设备 / 页面设置  
  
### 17. 获取功能设置  
  
- **Method**：==GET==  
- **Path**：==/api/v1/function-settings==  
  
**返回字段**  
  
- ==low_battery_threshold==  
- ==offline_threshold_seconds==  
- ==quick_entry_policy==  
- ==music_enabled==  
- ==favorite_limit==  
- ==auto_home_timeout_seconds==  
- ==position_device_thresholds==  
    - ==closed_max==  
    - ==opened_min==  
- ==settings_version==  
---  
### 18. 获取常用设备配置  
  
- **Method**：==GET==  
- **Path**：==/api/v1/favorites==  
  
**返回字段**  
  
- ==items==  
- ==selected_count==  
- ==max_recommended==  
- ==max_allowed==  
- ==settings_version==  
  
**==items[]== 字段**  
  
- ==device_id==  
- ==display_name==  
- ==device_type==  
- ==room_id==  
- ==room_name==  
- ==selected==  
- ==favorite_order==  
- ==is_selectable==  
- ==exclude_reason==  
  
**边界**  
  
- 默认媒体设备不作为默认候选。  
- 只读设备不作为默认候选。  
---  
### 19. 获取页面设置  
  
- **Method**：==GET==  
- **Path**：==/api/v1/page-settings==  
  
**返回字段**  
  
- ==room_label_mode==  
- ==homepage_display_policy==  
- ==icon_policy==  
- ==layout_preference==  
- ==settings_version==  
---  
### 5.8 编辑态  
  
### 20. 创建/获取编辑会话  
  
- **Method**：==POST==  
- **Path**：==/api/v1/editor/sessions==  
  
**请求字段**  
  
- ==terminal_id==  
- ==takeover_if_locked==：默认 ==false==  
  
**返回字段**  
  
- ==granted==  
- ==lease_id==  
- ==lease_expires_at==  
- ==heartbeat_interval_seconds==  
- ==lock_status==  
- ==locked_by==  
- ==draft_version==  
- ==current_layout_version==  
  
**==lock_status== 取值**  
  
- ==GRANTED==  
- ==LOCKED_BY_OTHER==  
- ==READ_ONLY==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
---  
### 21. 查询当前草稿  
  
- **Method**：==GET==  
- **Path**：==/api/v1/editor/draft==  
  
**请求参数**  
  
- ==lease_id==：可选  
  
**返回字段**  
  
- ==draft_exists==  
- ==draft_version==  
- ==base_layout_version==  
- ==lock_status==  
- ==layout==  
- ==readonly==  
  
**==layout== 建议字段**  
  
- ==background_image_url==  
- ==background_image_size==  
- ==hotspots==  
- ==layout_meta==  
  
**==hotspots[]== 字段**  
  
- ==hotspot_id==  
- ==device_id==  
- ==x==  
- ==y==  
- ==icon_type==  
- ==label_mode==  
- ==is_visible==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
---  
### 22. 续租编辑锁  
  
- **Method**：==POST==  
- **Path**：==/api/v1/editor/sessions/{lease_id}/heartbeat==  
  
**请求字段**  
  
- ==terminal_id==  
  
**返回字段**  
  
- ==lease_id==  
- ==lease_expires_at==  
- ==lock_status==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==DRAFT_LOCK_LOST==  
- ==DRAFT_LOCK_TAKEN_OVER==  
---  
### 23. 强制接管编辑锁  
  
- **Method**：==POST==  
- **Path**：==/api/v1/editor/sessions/{lease_id}/takeover==  
  
**请求字段**  
  
- ==terminal_id==  
- ==operator_id==  
  
**返回字段**  
  
- ==taken_over==  
- ==new_lease_id==  
- ==lease_expires_at==  
- ==previous_terminal_id==  
- ==draft_version==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==DRAFT_LOCK_LOST==  
---  
### 24. 更新草稿  
  
- **Method**：==PUT==  
- **Path**：==/api/v1/editor/draft==  
  
**请求字段**  
  
- ==lease_id==  
- ==draft_version==  
- ==base_layout_version==  
- ==layout==  
- ==hotspots==  
- ==structure_order==  
- ==removed_hotspot_ids==  
- ==updated_devices==  
  
**返回字段**  
  
- ==saved_to_draft==  
- ==draft_version==  
- ==preview_only==  
- ==lock_status==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==INVALID_PARAMS==  
- ==VERSION_CONFLICT==  
- ==DRAFT_LOCK_LOST==  
- ==DRAFT_LOCK_TAKEN_OVER==  
---  
### 25. 发布草稿  
  
- **Method**：==POST==  
- **Path**：==/api/v1/editor/publish==  
  
**请求字段**  
  
- ==lease_id==  
- ==draft_version==  
- ==base_layout_version==  
  
**返回字段**  
  
- ==published==  
- ==layout_version==  
- ==effective_at==  
- ==lock_released==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==VERSION_CONFLICT==  
- ==DRAFT_LOCK_LOST==  
- ==DRAFT_LOCK_TAKEN_OVER==  
  
**规则**  
  
- Publish 必须校验版本号与锁有效性。  
- 锁失效或被接管后不得继续发布。  
- 发布成功后必须广播 ==publish_succeeded== 事件。  
---  
### 26. 放弃草稿/退出编辑  
  
- **Method**：==DELETE==  
- **Path**：==/api/v1/editor/draft==  
  
**请求字段**  
  
- ==lease_id==  
- ==draft_version==：可选  
  
**返回字段**  
  
- ==discarded==  
- ==lock_released==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==DRAFT_LOCK_LOST==  
- ==DRAFT_LOCK_TAKEN_OVER==  
---  
### 5.9 电量  
  
### 27. 获取电量信息  
  
- **Method**：==GET==  
- **Path**：==/api/v1/energy==  
  
**返回字段**  
  
- ==binding_status==  
- ==refresh_status==  
- ==yesterday_usage==  
- ==monthly_usage==  
- ==balance==  
- ==yearly_usage==  
- ==updated_at==  
- ==cache_mode==  
- ==last_error_code==  
  
**==binding_status== 取值**  
  
- ==UNBOUND==  
- ==BOUND==  
- ==BINDING_INVALID==  
  
**==refresh_status== 取值**  
  
- ==IDLE==  
- ==LOADING==  
- ==SUCCESS==  
- ==FAILED==  
- ==CACHE_STALE==  
---  
### 28. 保存电量绑定  
  
- **Method**：==PUT==  
- **Path**：==/api/v1/energy/binding==  
  
**请求字段**  
  
- ==account_payload==  
- ==operator_id==  
- ==terminal_id==  
  
**返回字段**  
  
- ==saved==  
- ==binding_status==  
- ==updated_at==  
- ==message==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==INVALID_PARAMS==  
- ==ENERGY_SOURCE_ERROR==  
---  
### 29. 解绑电量绑定  
  
- **Method**：==DELETE==  
- **Path**：==/api/v1/energy/binding==  
  
**请求字段**  
  
- ==operator_id==  
- ==terminal_id==  
  
**返回字段**  
  
- ==saved==  
- ==binding_status==  
- ==updated_at==  
- ==message==  
  
**解绑结果**  
  
- 成功后 ==binding_status = UNBOUND==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
---  
### 30. 手动刷新电量  
  
- **Method**：==POST==  
- **Path**：==/api/v1/energy/refresh==  
  
**请求字段**  
  
- ==force_refresh==：可选  
  
**返回字段**  
  
- ==accepted==  
- ==refresh_status==  
- ==started_at==  
- ==timeout_seconds==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==ENERGY_SOURCE_ERROR==  
---  
### 5.10 媒体  
  
### 31. 获取默认媒体卡片数据  
  
- **Method**：==GET==  
- **Path**：==/api/v1/media/default==  
  
**返回字段**  
  
- ==binding_status==  
- ==availability_status==  
- ==device_id==  
- ==display_name==  
- ==play_state==  
- ==track_title==  
- ==artist==  
- ==cover_url==  
- ==entry_behavior==  
- ==confirmation_type==  
- ==control_schema==  
  
**==binding_status== 取值**  
  
- ==MEDIA_UNSET==  
- ==MEDIA_SET==  
  
**==availability_status== 取值**  
  
- ==ONLINE==  
- ==OFFLINE==  
  
**==play_state== 取值**  
  
- ==PLAYING==  
- ==PAUSED==  
- ==IDLE==  
  
**固定字段**  
  
- ==entry_behavior = OPEN_MEDIA_POPUP==  
- ==confirmation_type = PLAYBACK_STATE_DRIVEN==  
  
**边界规则**  
  
- 当 ==binding_status = MEDIA_UNSET== 时，==availability_status==、==device_id==、==display_name==、==play_state==、==track_title==、==artist==、==cover_url== 可返回 ==null==。  
- 当 ==binding_status = MEDIA_SET== 时，必须返回 ==availability_status==，用于区分“已绑定但离线”和“已绑定且在线”。  
- 默认媒体设备的实际控制仍统一走 ==POST /api/v1/device-controls==。  
- 本期不再单独保留媒体专用动作枚举接口。  
---  
### 32. 保存默认媒体设备绑定  
  
- **Method**：==PUT==  
- **Path**：==/api/v1/media/default/binding==  
  
**请求字段**  
  
- ==device_id==  
- ==operator_id==  
- ==terminal_id==  
  
**返回字段**  
  
- ==saved==  
- ==binding_status==  
- ==availability_status==  
- ==device_id==  
- ==display_name==  
- ==updated_at==  
  
**==binding_status== 取值**  
  
- ==MEDIA_UNSET==  
- ==MEDIA_SET==  
  
**==availability_status== 取值**  
  
- ==ONLINE==  
- ==OFFLINE==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==INVALID_PARAMS==  
---  
### 33. 解绑默认媒体设备绑定  
  
- **Method**：==DELETE==  
- **Path**：==/api/v1/media/default/binding==  
  
**请求字段**  
  
- ==operator_id==  
- ==terminal_id==  
  
**返回字段**  
  
- ==saved==  
- ==binding_status==  
- ==availability_status==  
- ==updated_at==  
  
**解绑结果**  
  
- 成功后 ==binding_status = MEDIA_UNSET==  
- 成功后 ==availability_status = null==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
---  
### 5.11 页面资源与设备映射  
  
### 34. 上传或替换户型底图  
  
- **Method**：==POST==  
- **Path**：==/api/v1/page-assets/floorplan==  
  
**请求字段**  
  
- ==file==  
- ==replace_current==  
- ==operator_id==  
- ==terminal_id==  
  
**返回字段**  
  
- ==asset_updated==  
- ==asset_id==  
- ==background_image_url==  
- ==background_image_size==  
- ==updated_at==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==INVALID_PARAMS==  
---  
### 35. 保存设备映射修正  
  
- **Method**：==PUT==  
- **Path**：==/api/v1/device-mappings/{device_id}==  
  
**请求字段**  
  
- ==room_id==：可选  
- ==device_type==：可选  
- ==is_primary_device==：可选  
- ==default_control_target==：可选  
  
**返回字段**  
  
- ==saved==  
- ==device_id==  
- ==room_id==  
- ==device_type==  
- ==is_primary_device==  
- ==default_control_target==  
- ==updated_at==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==INVALID_PARAMS==  
---  
### 5.12 备份恢复  
  
### 36. 触发手动备份  
  
- **Method**：==POST==  
- **Path**：==/api/v1/system/backups==  
  
**返回字段**  
  
- ==backup_id==  
- ==created_at==  
- ==status==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
---  
### 37. 获取备份列表  
  
- **Method**：==GET==  
- **Path**：==/api/v1/system/backups==  
  
**返回字段**  
  
- ==items==  
  
**==items[]== 字段**  
  
- ==backup_id==  
- ==created_at==  
- ==created_by==  
- ==status==  
- ==note==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
---  
### 38. 恢复备份  
  
- **Method**：==POST==  
- **Path**：==/api/v1/system/backups/{backup_id}/restore==  
  
**请求字段**  
  
- ==operator_id==  
- ==terminal_id==  
  
**返回字段**  
  
- ==restored==  
- ==settings_version==  
- ==layout_version==  
- ==effective_at==  
- ==message==  
  
**错误码**  
  
- ==UNAUTHORIZED==  
- ==PIN_REQUIRED==  
- ==PIN_LOCKED==  
- ==VERSION_CONFLICT==  
  
**同步要求**  
  
- 恢复成功后，后端必须广播 ==backup_restore_completed== 事件。  
- 所有在线终端收到事件后，必须同时刷新 ==settings_version== 与 ==layout_version==，并补拉正式快照。  
---  
## 六、WebSocket 事件规范  
  
### 6.1 连接信息  
  
- **Path**：==/ws==  
  
**连接参数**  
  
- ==Authorization: Bearer <access_token>==（推荐）  
- ==access_token==（仅用于受限终端兼容传输，语义等价于 Bearer）  
- ==terminal_id==  
- ==home_id==  
- 详细规则见《家庭智能中控 Web App 鉴权方案说明 v2.4.1》  
  
### 6.2 顶层公共字段  
  
- ==event_id==  
- ==event_type==  
- ==occurred_at==  
- ==sequence==  
- ==home_id==  
- ==change_domain==  
- ==snapshot_required==  
- ==payload==  
  
**==change_domain== 取值**  
  
- ==DEVICE_STATE==  
- ==SUMMARY==  
- ==SETTINGS==  
- ==LAYOUT==  
- ==EDITOR_LOCK==  
- ==ENERGY==  
- ==MEDIA==  
- ==BACKUP==  
  
### 6.3 最小事件清单  
  
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
  
### 6.4 配置版本与恢复相关事件  
  
### ==settings_updated==  
  
用于 Save All 成功后的全端同步。  
  
==payload== 至少包含：  
  
- ==settings_version==  
- ==updated_domains==  
- ==effective_at==  
  
推荐：  
  
- ==snapshot_required = true==  
  
### ==publish_succeeded==  
  
用于 Publish 成功后的全端同步。  
  
==payload== 至少包含：  
  
- ==layout_version==  
- ==effective_at==  
- ==published_by_terminal_id==  
  
推荐：  
  
- ==snapshot_required = true==  
  
### ==backup_restore_completed==  
  
用于恢复备份成功后的全端同步。  
  
==payload== 至少包含：  
  
- ==backup_id==  
- ==settings_version==  
- ==layout_version==  
- ==effective_at==  
- ==restored_by_terminal_id==  
  
推荐：  
  
- ==change_domain = BACKUP==  
- ==snapshot_required = true==  
  
### 6.5 控制相关状态事件载荷  
  
当 ==device_state_changed== 或 ==media_state_changed== 与某次控制请求相关时，==payload== 必须包含：  
  
- ==device_id==  
- ==related_request_id==  
- ==confirmation_type==  
- ==execution_status==  
- ==runtime_state==  
- ==error_code==  
- ==error_message==  
  
补充规则：  
  
1. ==related_request_id== 在**控制相关状态事件**中为冻结必填字段。  
2. 若事件并非由控制请求触发，则 ==related_request_id== 可省略。  
3. 控制最终结果应与 ==GET /api/v1/device-controls/{request_id}== 保持一致口径。  
  
### 6.6 编辑锁相关事件载荷  
  
### ==draft_lock_acquired==  
  
==payload== 至少包含：  
  
- ==lease_id==  
- ==terminal_id==  
- ==lease_expires_at==  
  
### ==draft_lock_lost==  
  
==payload== 至少包含：  
  
- ==lease_id==  
- ==terminal_id==  
- ==lost_reason==  
  
**==lost_reason== 取值**  
  
- ==LEASE_EXPIRED==  
- ==TAKEN_OVER==  
  
### ==draft_taken_over==  
  
==payload== 至少包含：  
  
- ==previous_terminal_id==  
- ==new_terminal_id==  
- ==new_operator_id==  
- ==new_lease_id==  
- ==draft_version==  
  
### 6.7 重连与补偿规则  
  
1. ==sequence== 仅在单连接内有效。  
2. 断线重连后，前端必须主动补拉快照。  
3. 若 ==snapshot_required = true==，前端必须立即补拉对应接口。  
4. 若检测到 ==sequence== 不连续，前端应进入补偿流程。  
  
**建议补拉接口**  
  
- 首页：==GET /api/v1/home/overview==  
- 设置中心：==GET /api/v1/settings==  
- 编辑态：==GET /api/v1/editor/draft==  
- 电量：==GET /api/v1/energy==  
- 音乐：==GET /api/v1/media/default==  
---  
## 七、不开放接口说明  
  
### 7.1 批量控制 / 全屋总控  
  
当前版本不开放。  
  
不提供：  
  
- 全屋灯光一键全关  
- 全屋空调一键全关  
- 全屋窗帘一键关闭  
- 其他批量控制接口  
  
### 7.2 场景相关接口  
  
当前版本不开放。  
  
不提供：  
  
- 场景列表  
- 场景执行  
- 场景编辑  
- 自动化编排  
  
### 7.3 复杂设备固定快捷入口接口  
  
当前版本不开放独立接口。  
  
复杂设备当前阶段不形成首页固定快捷分类入口，因此不提供复杂设备专用快捷面板接口。  
---  
## 八、冻结补充说明  
  
### 8.1 统计口径  
  
1. 在线 / 离线 / 低电量 / 摘要 / 常用设备排序统一按业务设备统计。  
2. 离线优先于低电量。  
3. 离线设备不进入低电量集合。  
4. 复杂设备仍按业务设备而非内部实体数统计。  
5. 只读设备可参与展示、统计、摘要与告警，但不进入控制执行链路。  
  
### 8.2 常用设备边界  
  
1. 默认媒体设备不作为当前默认候选。  
2. 只读设备不作为当前默认候选。  
3. 复杂设备后续可按能力策略扩展，但不作为当前默认范围。  
  
### 8.3 解绑语义冻结  
  
1. 电量解绑使用 ==DELETE /api/v1/energy/binding==。  
2. 默认媒体设备解绑使用 ==DELETE /api/v1/media/default/binding==。  
3. 本版本不再使用“传 null 代表解绑”作为正式冻结契约。  
  
### 8.4 编辑态冻结要求  
  
1. 锁租约时长 60s。  
2. 心跳周期 20s。  
3. 失锁后当前终端必须自动降级为只读态。  
4. 被接管后不得继续 Publish。  
5. Publish 必须同时校验 ==lease_id==、==draft_version==、==base_layout_version==。  
---  
## 九、结论  
  
《家庭智能中控 Web App 接口清单 v2.4》严格基于 PRD v2.4 修订完成。  
  
本版本已在 v2.3.5 基础上完成以下冻结前收口：  
  
1. 首页总览聚合结构统一收口为 ==sidebar==。  
2. 默认媒体设备返回体正式拆分为 ==binding_status== 与 ==availability_status==。  
3. Save All、Publish、备份恢复三类版本同步事件全部写入冻结接口契约。  
4. 编辑态错误码、控制事件归因字段与多端同步要求继续保持写实。  
5. 若干最小字段结构继续冻结，降低前后端联调与测试歧义。  
  
该版本可作为后续后端实现、前端联调、测试用例编写与数据库模型初稿继续对齐的接口基线版本。  
