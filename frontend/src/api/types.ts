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
