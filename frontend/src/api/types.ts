export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: ApiErrorPayload | null;
  meta: {
    trace_id: string;
    server_time: string;
  };
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  payload: ApiErrorPayload;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.payload = payload;
  }
}

export interface SessionDto {
  home_id: string;
  operator_id: string;
  terminal_id: string;
  login_mode: "FIXED_HOME_ACCOUNT";
  terminal_mode: "KIOSK" | "DESKTOP";
  access_token: string;
  access_token_expires_at: string | null;
  token_type: "Bearer";
  scope: string[];
  pin_session_active: boolean;
  pin_session_expires_at: string | null;
  features: {
    music_enabled: boolean;
    energy_enabled: boolean;
    editor_enabled: boolean;
  };
}

export interface SessionModel {
  homeId: string;
  operatorId: string;
  terminalId: string;
  loginMode: SessionDto["login_mode"];
  terminalMode: SessionDto["terminal_mode"];
  accessToken: string;
  accessTokenExpiresAt: string | null;
  pinSessionActive: boolean;
  pinSessionExpiresAt: string | null;
  features: SessionDto["features"];
}

export interface HomeOverviewDto {
  layout_version: string;
  settings_version: string;
  cache_mode: boolean;
  system_state?: Record<string, unknown>;
  stage: {
    background_image_url: string | null;
    background_image_size: {
      width: number;
      height: number;
    } | null;
    hotspots: Array<{
      hotspot_id: string;
      device_id: string;
      display_name: string;
      device_type: string;
      x: number;
      y: number;
      icon_type: string;
      status: string;
      is_offline: boolean;
      is_complex_device: boolean;
      is_readonly_device: boolean;
      entry_behavior: string;
      status_summary?: string | null;
    }>;
  };
  sidebar: {
    datetime?: string | null;
    weather?: {
      text?: string | null;
      temperature?: string | null;
    } | null;
    summary?: {
      online_count?: number;
      offline_count?: number;
      lights_on_count?: number;
      running_device_count?: number;
      low_battery_count?: number;
    } | null;
    music_card?: {
      binding_status: string;
      availability_status: string | null;
      device_id: string | null;
      display_name: string | null;
      play_state: string | null;
      track_title: string | null;
      artist: string | null;
      entry_behavior: string;
    } | null;
  };
  quick_entries?: Array<{
    key: string;
    title: string;
    badge_count?: number;
  }> | Record<string, boolean>;
  energy_bar?: {
    binding_status?: string;
    refresh_status?: string;
    monthly_usage?: string | number | null;
    balance?: string | number | null;
    updated_at?: string | null;
  } | null;
}

export interface DeviceListItemDto {
  device_id: string;
  display_name: string;
  raw_name: string | null;
  device_type: string;
  room_id: string | null;
  room_name: string | null;
  status: string;
  is_offline: boolean;
  is_complex_device: boolean;
  is_readonly_device: boolean;
  confirmation_type: string | null;
  entry_behavior: string;
  default_control_target: string | null;
  is_homepage_visible: boolean;
  is_primary_device: boolean;
  is_favorite: boolean;
  favorite_order: number | null;
  is_favorite_candidate: boolean;
  favorite_exclude_reason: string | null;
  capabilities: Record<string, unknown>;
  alert_badges: Array<{ code: string; level: string; text: string }>;
  status_summary: Record<string, unknown>;
}

export interface DeviceListDto {
  items: DeviceListItemDto[];
  page_info: {
    page: number;
    page_size: number;
    total: number;
    has_next: boolean;
  };
}

export interface DeviceRuntimeStateDto {
  last_state_update_at: string | null;
  aggregated_state: string | null;
  aggregated_mode: string | null;
  aggregated_position: number | null;
  telemetry: Record<string, unknown>;
  alerts: Array<{ code: string; level: string; text: string }>;
}

export interface DeviceControlSchemaItemDto {
  action_type: string;
  target_scope: string | null;
  target_key: string | null;
  value_type: string | null;
  value_range: Record<string, unknown> | null;
  allowed_values: unknown[] | null;
  unit: string | null;
  is_quick_action: boolean;
  requires_detail_entry: boolean;
}

export interface DeviceEntityLinkDto {
  ha_entity_row_id?: string;
  entity_id: string;
  platform: string | null;
  domain: string | null;
  raw_name?: string | null;
  state?: string | null;
  room_hint?: string | null;
  is_available?: boolean;
  last_synced_at?: string | null;
  last_state_changed_at?: string | null;
  entity_role: string | null;
  is_primary: boolean;
  sort_order?: number;
}

export interface DeviceDetailDto {
  device_id: string;
  display_name: string;
  raw_name: string | null;
  device_type: string;
  room_id: string | null;
  room_name: string | null;
  status: string;
  is_offline: boolean;
  is_complex_device: boolean;
  is_readonly_device: boolean;
  confirmation_type: string | null;
  entry_behavior: string | null;
  default_control_target: string | null;
  capabilities: Record<string, unknown>;
  alert_badges: Array<{ code: string; level: string; text: string }>;
  status_summary: Record<string, unknown>;
  runtime_state: DeviceRuntimeStateDto | null;
  control_schema: DeviceControlSchemaItemDto[];
  editor_config: Record<string, unknown> | null;
  source_info: Record<string, unknown> & {
    entity_links?: DeviceEntityLinkDto[];
  };
}

export interface DeviceControlPayloadInput {
  target_scope?: string | null;
  target_key?: string | null;
  value?: unknown;
  unit?: string | null;
}

export interface DeviceControlRequestInput {
  request_id: string;
  device_id: string;
  action_type: string;
  payload: DeviceControlPayloadInput;
  client_ts?: string;
}

export interface DeviceControlAcceptedDto {
  request_id: string;
  device_id: string;
  accepted: boolean;
  acceptance_status: "ACCEPTED";
  confirmation_type: "ACK_DRIVEN" | "STATE_DRIVEN" | "PLAYBACK_STATE_DRIVEN";
  accepted_at: string | null;
  timeout_seconds: number;
  retry_scheduled: boolean;
  message: string;
  result_query_path: string;
}

export interface DeviceControlResultDto {
  request_id: string;
  device_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  acceptance_status: "ACCEPTED";
  confirmation_type: "ACK_DRIVEN" | "STATE_DRIVEN" | "PLAYBACK_STATE_DRIVEN";
  execution_status: "PENDING" | "SUCCESS" | "FAILED" | "TIMEOUT" | "STATE_MISMATCH";
  retry_count: number;
  final_runtime_state: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  accepted_at: string | null;
  completed_at: string | null;
}

export interface DeviceReloadInput {
  force_full_sync: boolean;
}

export interface DeviceReloadDto {
  accepted: boolean;
  reload_status: string;
  started_at: string;
  message: string;
}

export interface RoomListItemDto {
  room_id: string;
  room_name: string;
  priority: number;
  device_count: number;
  homepage_device_count: number;
  visible_in_editor: boolean;
}

export interface RoomListDto {
  rooms: RoomListItemDto[];
}

export interface SettingsDto {
  favorites?: Array<Record<string, unknown>>;
  page_settings?: Record<string, unknown>;
  function_settings?: Record<string, unknown>;
  system_settings_summary?: Record<string, unknown>;
  settings_version: string;
  pin_session_required: boolean;
}

export interface SettingsSaveInput {
  settings_version: string | null;
  page_settings: Record<string, unknown>;
  function_settings: Record<string, unknown>;
  favorites: Array<Record<string, unknown>>;
  terminal_id: string;
}

export interface SettingsSaveDto {
  saved: boolean;
  settings_version: string;
  updated_domains: string[];
  effective_at: string;
}

export interface SystemConnectionDto {
  connection_mode: string | null;
  base_url_masked: string | null;
  connection_status: string;
  auth_configured: boolean;
  settings_version: string | null;
  last_test_at: string | null;
  last_test_result: string | null;
  last_sync_at: string | null;
  last_sync_result: string | null;
}

export interface SystemConnectionsEnvelopeDto {
  home_assistant: SystemConnectionDto | null;
  settings_version: string | null;
}

export interface SystemConnectionSaveInput {
  connection_mode: string;
  base_url: string;
  auth_payload: {
    access_token?: string;
  };
}

export interface SystemConnectionSaveDto {
  saved: boolean;
  connection_status: string;
  updated_at: string;
  message: string;
}

export interface SystemConnectionTestInput {
  use_saved_config?: boolean;
  candidate_config?: {
    connection_mode: string;
    base_url: string;
    auth_payload: {
      access_token?: string;
    };
  };
}

export interface SystemConnectionTestDto {
  tested: boolean;
  connection_status: string;
  latency_ms: number | null;
  tested_at: string;
  message: string | null;
}

export interface EditorSessionDto {
  granted: boolean;
  lease_id: string | null;
  lease_expires_at: string | null;
  heartbeat_interval_seconds: number | null;
  lock_status: "GRANTED" | "LOCKED_BY_OTHER" | "READ_ONLY";
  locked_by?: {
    terminal_id?: string;
    operator_id?: string;
  } | null;
  draft_version: string | null;
  current_layout_version: string | null;
}

export interface EditorDraftDto {
  draft_exists: boolean;
  draft_version: string | null;
  base_layout_version: string | null;
  lock_status: "GRANTED" | "LOCKED_BY_OTHER" | "READ_ONLY";
  layout: {
    background_image_url: string | null;
    background_image_size: {
      width: number;
      height: number;
    } | null;
    hotspots: Array<Record<string, unknown>>;
    layout_meta: Record<string, unknown>;
  } | null;
  readonly: boolean;
}

export interface EditorDraftSaveHotspotInput {
  hotspot_id: string;
  device_id: string;
  x: number;
  y: number;
  icon_type?: string | null;
  label_mode?: string | null;
  is_visible?: boolean;
  structure_order?: number;
}

export interface EditorDraftSaveInput {
  home_id?: string | null;
  terminal_id: string;
  lease_id: string;
  draft_version: string;
  base_layout_version: string;
  background_asset_id?: string | null;
  layout_meta: Record<string, unknown>;
  hotspots: EditorDraftSaveHotspotInput[];
}

export interface EditorDraftSaveDto {
  saved_to_draft: boolean;
  draft_version: string;
  preview_only: boolean;
  lock_status: "GRANTED" | "LOCKED_BY_OTHER" | "READ_ONLY";
}

export interface EditorPublishInput {
  home_id?: string | null;
  terminal_id: string;
  lease_id: string;
  draft_version: string;
  base_layout_version: string;
}

export interface EditorPublishDto {
  published: boolean;
  layout_version: string;
  effective_at: string;
  lock_released: boolean;
}

export interface PinVerifyInput {
  home_id: string;
  terminal_id: string;
  pin: string;
  target_action?: string | null;
}

export interface PinVerifyDto {
  verified: boolean;
  pin_session_active: boolean;
  pin_session_expires_at: string;
  remaining_attempts: number;
  lock_until: string | null;
}

export interface PinSessionDto {
  pin_session_active: boolean;
  pin_session_expires_at: string | null;
  remaining_lock_seconds: number;
}

export interface WsEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  sequence: number;
  home_id: string;
  change_domain: string;
  snapshot_required: boolean;
  payload: Record<string, unknown>;
}
