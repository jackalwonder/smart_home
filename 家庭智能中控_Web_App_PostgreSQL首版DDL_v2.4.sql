-- 《家庭智能中控 Web App PostgreSQL 首版 DDL v2.4》
-- 版本状态：已冻结（首版实施 DDL）
-- 基线文档：
-- 1. 《家庭智能中控 Web App PRD v2.4》
-- 2. 《家庭智能中控 Web App 接口清单 v2.4》
-- 3. 《家庭智能中控 Web App 统一响应体与错误体规范 v2.4》
-- 4. 《家庭智能中控 Web App 数据库模型初稿 v2.4》
-- 5. 《家庭智能中控 Web App 数据库 ER 图与关系说明 v2.4》
--
-- 冻结实施口径：
-- 1. 内部主键统一使用 UUID。
-- 2. 当前正式 layout_version / settings_version 的唯一判定口径为：
--    按 (effective_at DESC, created_at DESC) 取最新记录。
-- 3. 编辑锁持久化状态使用 lease_status；接口 lock_status 由查询层推导。
-- 4. ws_event_outbox 采用家庭级 event_id 唯一约束保证事件幂等。
-- 5. sidebar.weather 本期不建表，由聚合层外部天气源 + 短 TTL 缓存实现。

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE terminal_mode_enum AS ENUM ('KIOSK', 'DESKTOP');
CREATE TYPE login_mode_enum AS ENUM ('FIXED_HOME_ACCOUNT');
CREATE TYPE confirmation_type_enum AS ENUM ('ACK_DRIVEN', 'TARGET_STATE_DRIVEN', 'PLAYBACK_STATE_DRIVEN');
CREATE TYPE entry_behavior_enum AS ENUM (
    'QUICK_ACTION',
    'OPEN_CONTROL_CARD',
    'OPEN_MEDIA_POPUP',
    'OPEN_COMPLEX_CARD',
    'OPEN_READONLY_CARD',
    'DISABLED_OFFLINE'
);
CREATE TYPE execution_status_enum AS ENUM (
    'PENDING',
    'ACK_SUCCESS',
    'SUCCESS',
    'RECONCILING',
    'FAILED',
    'TIMEOUT',
    'STATE_MISMATCH'
);
CREATE TYPE acceptance_status_enum AS ENUM ('ACCEPTED', 'REJECTED');
CREATE TYPE entity_role_enum AS ENUM (
    'PRIMARY_CONTROL',
    'SECONDARY_CONTROL',
    'TELEMETRY',
    'STATUS',
    'ALERT',
    'DERIVED'
);
CREATE TYPE connection_status_enum AS ENUM ('CONNECTED', 'DISCONNECTED', 'DEGRADED');
CREATE TYPE energy_binding_status_enum AS ENUM ('UNBOUND', 'BOUND', 'BINDING_INVALID');
CREATE TYPE refresh_status_enum AS ENUM ('IDLE', 'LOADING', 'SUCCESS', 'FAILED', 'CACHE_STALE');
CREATE TYPE media_binding_status_enum AS ENUM ('MEDIA_UNSET', 'MEDIA_SET');
CREATE TYPE availability_status_enum AS ENUM ('ONLINE', 'OFFLINE');
CREATE TYPE lease_status_enum AS ENUM ('ACTIVE', 'RELEASED', 'LOST', 'TAKEN_OVER');
CREATE TYPE lost_reason_enum AS ENUM ('LEASE_EXPIRED', 'TAKEN_OVER');
CREATE TYPE change_domain_enum AS ENUM (
    'DEVICE_STATE',
    'SUMMARY',
    'SETTINGS',
    'LAYOUT',
    'EDITOR_LOCK',
    'ENERGY',
    'MEDIA',
    'BACKUP'
);
CREATE TYPE asset_type_enum AS ENUM ('FLOORPLAN');
CREATE TYPE system_type_enum AS ENUM ('HOME_ASSISTANT');
CREATE TYPE display_policy_enum AS ENUM ('ICON_ONLY', 'LIGHT_SUMMARY', 'ALERT_PRIORITY');
CREATE TYPE ha_sync_mode_enum AS ENUM ('EVENT_STREAM', 'POLLING');
CREATE TYPE ha_sync_status_enum AS ENUM ('CONNECTED', 'DEGRADED', 'RECOVERING');
CREATE TYPE outbox_delivery_status_enum AS ENUM ('PENDING', 'DISPATCHING', 'DISPATCHED', 'FAILED');

CREATE TABLE homes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_code text UNIQUE,
    display_name text NOT NULL,
    timezone text NOT NULL,
    status text NOT NULL,
    capability_flags_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_homes_updated_at ON homes (updated_at);

CREATE TABLE members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    display_name text NOT NULL,
    role text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_members_home_id ON members (home_id);
CREATE INDEX idx_members_home_display_name ON members (home_id, display_name);

CREATE TABLE terminals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    terminal_code text NOT NULL UNIQUE,
    terminal_name text NOT NULL,
    terminal_mode terminal_mode_enum NOT NULL,
    last_seen_at timestamptz,
    last_ip inet,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_terminals_home_mode ON terminals (home_id, terminal_mode);

CREATE TABLE home_auth_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL UNIQUE REFERENCES homes(id) ON DELETE CASCADE,
    login_mode login_mode_enum NOT NULL DEFAULT 'FIXED_HOME_ACCOUNT',
    pin_hash text NOT NULL,
    pin_salt text,
    pin_retry_limit integer NOT NULL DEFAULT 5 CHECK (pin_retry_limit > 0),
    pin_lock_minutes integer NOT NULL DEFAULT 5 CHECK (pin_lock_minutes > 0),
    pin_session_ttl_seconds integer NOT NULL DEFAULT 600 CHECK (pin_session_ttl_seconds > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pin_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    terminal_id uuid NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    member_id uuid REFERENCES members(id) ON DELETE SET NULL,
    verified_for_action text,
    session_token_hash text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    verified_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (expires_at >= verified_at)
);

CREATE INDEX idx_pin_sessions_home_terminal_active ON pin_sessions (home_id, terminal_id, is_active);
CREATE INDEX idx_pin_sessions_expires_at ON pin_sessions (expires_at);
CREATE UNIQUE INDEX uq_pin_sessions_active_terminal ON pin_sessions (home_id, terminal_id) WHERE is_active = true;

CREATE TABLE pin_lock_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    terminal_id uuid NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
    failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until timestamptz,
    last_failed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (home_id, terminal_id)
);

CREATE INDEX idx_pin_lock_records_locked_until ON pin_lock_records (locked_until);

CREATE TABLE rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    room_name text NOT NULL,
    priority integer NOT NULL DEFAULT 0,
    visible_in_editor boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (home_id, room_name)
);

CREATE INDEX idx_rooms_home_sort_order ON rooms (home_id, sort_order);

CREATE TABLE ha_entities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    entity_id text NOT NULL,
    platform text NOT NULL,
    domain text NOT NULL,
    raw_name text,
    state text NOT NULL,
    attributes_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_synced_at timestamptz,
    last_state_changed_at timestamptz,
    room_hint text,
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (home_id, entity_id)
);

CREATE INDEX idx_ha_entities_home_domain ON ha_entities (home_id, domain);
CREATE INDEX idx_ha_entities_last_synced_at ON ha_entities (last_synced_at);

CREATE TABLE devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
    display_name text NOT NULL,
    raw_name text,
    device_type text NOT NULL,
    is_complex_device boolean NOT NULL DEFAULT false,
    is_readonly_device boolean NOT NULL DEFAULT false,
    confirmation_type confirmation_type_enum,
    entry_behavior entry_behavior_enum NOT NULL,
    default_control_target text,
    is_primary_device boolean NOT NULL DEFAULT false,
    is_homepage_visible boolean NOT NULL DEFAULT false,
    capabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_home_id ON devices (home_id);
CREATE INDEX idx_devices_home_room_id ON devices (home_id, room_id);
CREATE INDEX idx_devices_home_device_type ON devices (home_id, device_type);
CREATE INDEX idx_devices_home_visible ON devices (home_id, is_homepage_visible);

CREATE TABLE device_entity_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ha_entity_id uuid NOT NULL REFERENCES ha_entities(id) ON DELETE RESTRICT,
    entity_role entity_role_enum NOT NULL,
    is_primary boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (device_id, ha_entity_id),
    UNIQUE (ha_entity_id)
);

CREATE INDEX idx_device_entity_links_device_role ON device_entity_links (device_id, entity_role);
CREATE INDEX idx_device_entity_links_home_device ON device_entity_links (home_id, device_id);

CREATE TABLE device_runtime_states (
    device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    status text NOT NULL,
    is_offline boolean NOT NULL DEFAULT false,
    status_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    runtime_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    aggregated_state text,
    aggregated_mode text,
    aggregated_position numeric(5,2),
    last_state_update_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_runtime_states_home_status ON device_runtime_states (home_id, status);
CREATE INDEX idx_device_runtime_states_home_offline ON device_runtime_states (home_id, is_offline);
CREATE INDEX idx_device_runtime_states_last_state_update_at ON device_runtime_states (last_state_update_at);

CREATE TABLE device_alert_badges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    code text NOT NULL,
    level text NOT NULL,
    text text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_alert_badges_device_active ON device_alert_badges (device_id, is_active);
CREATE INDEX idx_device_alert_badges_device_level ON device_alert_badges (device_id, level);

CREATE TABLE device_control_schemas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    action_type text NOT NULL CHECK (action_type IN (
        'TOGGLE_POWER',
        'SET_POWER_STATE',
        'SET_MODE',
        'SET_VALUE',
        'SET_TEMPERATURE',
        'SET_POSITION',
        'EXECUTE_ACTION'
    )),
    target_scope text,
    target_key text,
    value_type text NOT NULL,
    value_range_json jsonb,
    allowed_values_json jsonb,
    unit text,
    is_quick_action boolean NOT NULL DEFAULT false,
    requires_detail_entry boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (device_id, action_type, target_scope, target_key)
);

CREATE INDEX idx_device_control_schemas_device_id ON device_control_schemas (device_id);

CREATE TABLE page_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    asset_type asset_type_enum NOT NULL,
    file_url text NOT NULL,
    file_hash text NOT NULL,
    width integer CHECK (width > 0),
    height integer CHECK (height > 0),
    mime_type text NOT NULL,
    uploaded_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
    uploaded_by_terminal_id uuid REFERENCES terminals(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_assets_home_type_created_at ON page_assets (home_id, asset_type, created_at DESC);

CREATE TABLE layout_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    layout_version text NOT NULL,
    background_asset_id uuid REFERENCES page_assets(id) ON DELETE SET NULL,
    layout_meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    effective_at timestamptz NOT NULL,
    published_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
    published_by_terminal_id uuid REFERENCES terminals(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (home_id, layout_version)
);

CREATE INDEX idx_layout_versions_home_effective_at ON layout_versions (home_id, effective_at DESC, created_at DESC);

CREATE TABLE layout_hotspots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    layout_version_id uuid NOT NULL REFERENCES layout_versions(id) ON DELETE CASCADE,
    hotspot_id text NOT NULL,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    x numeric(8,6) NOT NULL CHECK (x >= 0 AND x <= 1),
    y numeric(8,6) NOT NULL CHECK (y >= 0 AND y <= 1),
    icon_type text,
    label_mode text,
    is_visible boolean NOT NULL DEFAULT true,
    structure_order integer NOT NULL DEFAULT 0,
    display_policy display_policy_enum,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (layout_version_id, hotspot_id)
);

CREATE INDEX idx_layout_hotspots_layout_structure_order ON layout_hotspots (layout_version_id, structure_order);
CREATE INDEX idx_layout_hotspots_device_id ON layout_hotspots (device_id);

CREATE TABLE settings_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    settings_version text NOT NULL,
    updated_domains_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    effective_at timestamptz NOT NULL,
    saved_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
    saved_by_terminal_id uuid REFERENCES terminals(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (home_id, settings_version)
);

CREATE INDEX idx_settings_versions_home_effective_at ON settings_versions (home_id, effective_at DESC, created_at DESC);

CREATE TABLE favorite_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    settings_version_id uuid NOT NULL REFERENCES settings_versions(id) ON DELETE CASCADE,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    selected boolean NOT NULL DEFAULT true,
    favorite_order integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (settings_version_id, device_id)
);

CREATE INDEX idx_favorite_devices_home_settings_version ON favorite_devices (home_id, settings_version_id);
CREATE UNIQUE INDEX uq_favorite_devices_selected_order
    ON favorite_devices (settings_version_id, favorite_order)
    WHERE selected = true AND favorite_order IS NOT NULL;

CREATE TABLE page_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    settings_version_id uuid NOT NULL UNIQUE REFERENCES settings_versions(id) ON DELETE CASCADE,
    room_label_mode text NOT NULL,
    homepage_display_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    icon_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    layout_preference_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_settings_home_settings_version ON page_settings (home_id, settings_version_id);

CREATE TABLE function_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    settings_version_id uuid NOT NULL UNIQUE REFERENCES settings_versions(id) ON DELETE CASCADE,
    low_battery_threshold numeric(5,2) NOT NULL CHECK (low_battery_threshold >= 0 AND low_battery_threshold <= 100),
    offline_threshold_seconds integer NOT NULL CHECK (offline_threshold_seconds > 0),
    quick_entry_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    music_enabled boolean NOT NULL DEFAULT true,
    favorite_limit integer NOT NULL CHECK (favorite_limit > 0),
    auto_home_timeout_seconds integer NOT NULL CHECK (auto_home_timeout_seconds > 0),
    position_device_thresholds_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_function_settings_home_settings_version ON function_settings (home_id, settings_version_id);

CREATE TABLE system_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    system_type system_type_enum NOT NULL,
    connection_mode text NOT NULL,
    base_url_encrypted text,
    auth_payload_encrypted text,
    auth_configured boolean NOT NULL DEFAULT false,
    connection_status connection_status_enum NOT NULL DEFAULT 'DISCONNECTED',
    last_test_at timestamptz,
    last_test_result text,
    last_sync_at timestamptz,
    last_sync_result text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (home_id, system_type)
);

CREATE INDEX idx_system_connections_home_status ON system_connections (home_id, connection_status);

CREATE TABLE energy_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL UNIQUE REFERENCES homes(id) ON DELETE CASCADE,
    binding_status energy_binding_status_enum NOT NULL DEFAULT 'UNBOUND',
    account_payload_encrypted text,
    updated_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
    updated_by_terminal_id uuid REFERENCES terminals(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE energy_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    binding_status energy_binding_status_enum NOT NULL,
    refresh_status refresh_status_enum NOT NULL,
    yesterday_usage numeric(12,4),
    monthly_usage numeric(12,4),
    yearly_usage numeric(12,4),
    balance numeric(12,4),
    cache_mode boolean NOT NULL DEFAULT false,
    last_error_code text,
    source_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_energy_snapshots_home_created_at ON energy_snapshots (home_id, created_at DESC);
CREATE INDEX idx_energy_snapshots_home_refresh_status ON energy_snapshots (home_id, refresh_status);

CREATE TABLE media_bindings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL UNIQUE REFERENCES homes(id) ON DELETE CASCADE,
    device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    binding_status media_binding_status_enum NOT NULL DEFAULT 'MEDIA_UNSET',
    availability_status availability_status_enum,
    updated_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
    updated_by_terminal_id uuid REFERENCES terminals(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (binding_status = 'MEDIA_UNSET' AND device_id IS NULL)
        OR (binding_status = 'MEDIA_SET' AND device_id IS NOT NULL)
    )
);

CREATE INDEX idx_media_bindings_device_id ON media_bindings (device_id);

CREATE TABLE draft_layouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL UNIQUE REFERENCES homes(id) ON DELETE CASCADE,
    draft_version text NOT NULL,
    base_layout_version text NOT NULL,
    background_asset_id uuid REFERENCES page_assets(id) ON DELETE SET NULL,
    layout_meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    readonly_snapshot_json jsonb,
    updated_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
    updated_by_terminal_id uuid REFERENCES terminals(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_draft_layouts_draft_version ON draft_layouts (draft_version);
CREATE INDEX idx_draft_layouts_base_layout_version ON draft_layouts (base_layout_version);

CREATE TABLE draft_hotspots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_layout_id uuid NOT NULL REFERENCES draft_layouts(id) ON DELETE CASCADE,
    hotspot_id text NOT NULL,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    x numeric(8,6) NOT NULL CHECK (x >= 0 AND x <= 1),
    y numeric(8,6) NOT NULL CHECK (y >= 0 AND y <= 1),
    icon_type text,
    label_mode text,
    is_visible boolean NOT NULL DEFAULT true,
    structure_order integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (draft_layout_id, hotspot_id)
);

CREATE INDEX idx_draft_hotspots_layout_structure_order ON draft_hotspots (draft_layout_id, structure_order);

CREATE TABLE draft_leases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    lease_id text NOT NULL UNIQUE,
    terminal_id uuid NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
    member_id uuid REFERENCES members(id) ON DELETE SET NULL,
    lease_status lease_status_enum NOT NULL DEFAULT 'ACTIVE',
    is_active boolean NOT NULL DEFAULT true,
    lease_expires_at timestamptz NOT NULL,
    heartbeat_interval_seconds integer NOT NULL CHECK (heartbeat_interval_seconds > 0),
    last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
    taken_over_from_lease_id text,
    lost_reason lost_reason_enum,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (lease_expires_at >= last_heartbeat_at)
);

CREATE UNIQUE INDEX uq_draft_leases_active_home ON draft_leases (home_id) WHERE is_active = true;
CREATE INDEX idx_draft_leases_home_status ON draft_leases (home_id, lease_status);
CREATE INDEX idx_draft_leases_home_expires_at ON draft_leases (home_id, lease_expires_at);
CREATE INDEX idx_draft_leases_home_terminal_status ON draft_leases (home_id, terminal_id, lease_status);

CREATE TABLE device_control_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    request_id text NOT NULL,
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    action_type text NOT NULL CHECK (action_type IN (
        'TOGGLE_POWER',
        'SET_POWER_STATE',
        'SET_MODE',
        'SET_VALUE',
        'SET_TEMPERATURE',
        'SET_POSITION',
        'EXECUTE_ACTION'
    )),
    payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    client_ts timestamptz,
    acceptance_status acceptance_status_enum NOT NULL,
    confirmation_type confirmation_type_enum,
    execution_status execution_status_enum NOT NULL,
    retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    retry_scheduled boolean NOT NULL DEFAULT false,
    accepted_at timestamptz,
    completed_at timestamptz,
    timeout_seconds integer NOT NULL CHECK (timeout_seconds > 0),
    final_runtime_state_json jsonb,
    error_code text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (home_id, request_id)
);

CREATE INDEX idx_device_control_requests_home_device_created_at
    ON device_control_requests (home_id, device_id, created_at DESC);
CREATE INDEX idx_device_control_requests_home_execution_status
    ON device_control_requests (home_id, execution_status);
CREATE INDEX idx_device_control_requests_accepted_at ON device_control_requests (accepted_at);
CREATE INDEX idx_device_control_requests_completed_at ON device_control_requests (completed_at);

CREATE TABLE device_control_request_transitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    control_request_id uuid NOT NULL REFERENCES device_control_requests(id) ON DELETE CASCADE,
    from_status execution_status_enum,
    to_status execution_status_enum NOT NULL,
    reason text,
    error_code text,
    payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_control_request_transitions_request_id
    ON device_control_request_transitions (control_request_id);
CREATE INDEX idx_device_control_request_transitions_request_created_at
    ON device_control_request_transitions (control_request_id, created_at);

CREATE TABLE system_backups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    backup_id text NOT NULL,
    status text NOT NULL,
    note text,
    snapshot_path text,
    snapshot_blob bytea,
    created_by_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
    created_by_terminal_id uuid REFERENCES terminals(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    restored_at timestamptz,
    UNIQUE (home_id, backup_id),
    CHECK (snapshot_path IS NOT NULL OR snapshot_blob IS NOT NULL)
);

CREATE INDEX idx_system_backups_home_created_at ON system_backups (home_id, created_at DESC);

CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    operator_id uuid REFERENCES members(id) ON DELETE SET NULL,
    terminal_id uuid REFERENCES terminals(id) ON DELETE SET NULL,
    action_type text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    request_id text,
    before_version text,
    after_version text,
    result_status text NOT NULL,
    error_code text,
    payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_home_created_at ON audit_logs (home_id, created_at DESC);
CREATE INDEX idx_audit_logs_home_action_created_at ON audit_logs (home_id, action_type, created_at DESC);
CREATE INDEX idx_audit_logs_request_id ON audit_logs (request_id);

CREATE TABLE ws_event_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    event_id text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN (
        'device_state_changed',
        'summary_updated',
        'settings_updated',
        'publish_succeeded',
        'draft_lock_acquired',
        'draft_lock_lost',
        'draft_taken_over',
        'version_conflict_detected',
        'energy_refresh_completed',
        'energy_refresh_failed',
        'media_state_changed',
        'backup_restore_completed',
        'ha_sync_degraded',
        'ha_sync_recovered'
    )),
    change_domain change_domain_enum NOT NULL,
    snapshot_required boolean NOT NULL DEFAULT false,
    payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL,
    delivery_status outbox_delivery_status_enum NOT NULL DEFAULT 'PENDING',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (home_id, event_id)
);

CREATE INDEX idx_ws_event_outbox_home_created_at ON ws_event_outbox (home_id, created_at);
CREATE INDEX idx_ws_event_outbox_home_event_occurred_at ON ws_event_outbox (home_id, event_type, occurred_at);

CREATE TABLE ha_sync_status (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id uuid NOT NULL UNIQUE REFERENCES homes(id) ON DELETE CASCADE,
    sync_mode ha_sync_mode_enum NOT NULL,
    status ha_sync_status_enum NOT NULL,
    last_event_at timestamptz,
    last_full_resync_at timestamptz,
    last_error_code text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 读模型辅助视图：当前正式版本统一按 effective_at / created_at 最新记录判定。
CREATE VIEW v_current_layout_versions AS
SELECT DISTINCT ON (home_id)
    id,
    home_id,
    layout_version,
    background_asset_id,
    layout_meta_json,
    effective_at,
    published_by_member_id,
    published_by_terminal_id,
    created_at
FROM layout_versions
ORDER BY home_id, effective_at DESC, created_at DESC;

CREATE VIEW v_current_settings_versions AS
SELECT DISTINCT ON (home_id)
    id,
    home_id,
    settings_version,
    updated_domains_json,
    effective_at,
    saved_by_member_id,
    saved_by_terminal_id,
    created_at
FROM settings_versions
ORDER BY home_id, effective_at DESC, created_at DESC;

COMMIT;
