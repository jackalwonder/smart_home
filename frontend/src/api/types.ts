import type { components } from "./types.generated";

type Schema<Name extends keyof components["schemas"]> = components["schemas"][Name];
type RequireFields<T, Keys extends keyof T> = Omit<T, Keys> & {
  [Key in Keys]-?: Exclude<T[Key], undefined>;
};

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

export type SessionDto = RequireFields<
  Schema<"AuthSessionResponse">,
  "operator_id" | "access_token_expires_at" | "pin_session_expires_at"
>;

export interface SessionModel {
  homeId: string;
  operatorId: string | null;
  terminalId: string;
  loginMode: SessionDto["login_mode"];
  terminalMode: SessionDto["terminal_mode"];
  accessToken: string;
  accessTokenExpiresAt: string | null;
  pinSessionActive: boolean;
  pinSessionExpiresAt: string | null;
  features: SessionDto["features"];
}

export type HomeOverviewDto = Schema<"HomeOverviewResponse">;

export type DeviceListItemDto = Schema<"DeviceListItemResponse">;

export type DeviceListDto = RequireFields<Schema<"DeviceListResponse">, "items">;

export type DeviceRuntimeStateDto = Schema<"DeviceRuntimeState">;

export type DeviceControlSchemaItemDto = Schema<"DeviceControlSchemaItem">;

export type DeviceEntityLinkDto = Schema<"DeviceEntityLinkResponse">;

type DeviceDetailResponse = Schema<"DeviceDetailResponse">;

export type DeviceDetailDto = RequireFields<
  DeviceDetailResponse,
  "runtime_state" | "control_schema" | "source_info" | "editor_config"
> & {
  runtime_state: DeviceRuntimeStateDto | null;
  control_schema: DeviceControlSchemaItemDto[];
  source_info: Schema<"DeviceSourceInfoResponse">;
  editor_config: Schema<"DeviceEditorConfigResponse"> | null;
};

export type DeviceControlPayloadInput = Schema<"DeviceControlPayload">;

export type DeviceControlRequestInput = RequireFields<
  Omit<Schema<"DeviceControlRequestBody">, "home_id">,
  "payload"
>;

export type DeviceControlAcceptedDto = Schema<"DeviceControlAcceptedResponse">;

export type DeviceControlResultDto = Schema<"DeviceControlResultResponse">;

export type DeviceReloadInput = Schema<"DeviceReloadBody">;

export type DeviceReloadDto = Schema<"DeviceReloadResponse">;

export type RoomListItemDto = Schema<"RoomListItemResponse">;

export type RoomListDto = RequireFields<Schema<"RoomListResponse">, "rooms">;

export type SettingsDto = Schema<"SettingsSnapshotResponse">;

export type SettingsSaveInput = RequireFields<
  Omit<Schema<"SettingsSaveRequestBody">, "home_id" | "terminal_id" | "member_id">,
  "settings_version" | "page_settings" | "function_settings" | "favorites"
>;

export type SettingsSaveDto = Schema<"SettingsSaveResponse">;

export type SystemConnectionDto = Schema<"SystemConnectionResponse">;

export type SystemConnectionsEnvelopeDto = Schema<"SystemConnectionsEnvelopeResponse">;

export type SystemConnectionSaveInput = RequireFields<
  Pick<Schema<"HomeAssistantSaveBody">, "connection_mode" | "base_url" | "auth_payload">,
  "auth_payload"
>;

type HomeAssistantCandidateConfigBody = Exclude<
  Schema<"HomeAssistantTestBody">["candidate_config"],
  undefined | null
>;

export type SystemConnectionTestInput =
  | { use_saved_config: true }
  | {
      use_saved_config?: false;
      candidate_config: HomeAssistantCandidateConfigBody;
    };

export type SystemConnectionSaveDto = Schema<"SystemConnectionSaveResponse">;

export type SystemConnectionTestDto = Schema<"SystemConnectionTestResponse">;

export type EnergyDto = Schema<"EnergyResponse">;

export type EnergyBindingInput = Omit<
  Schema<"EnergyBindingBody">,
  "home_id" | "terminal_id" | "member_id"
>;

export type EnergyBindingDto = Schema<"EnergyBindingResponse">;

export type EnergyRefreshDto = Schema<"EnergyRefreshResponse">;

export type DefaultMediaDto = Schema<"DefaultMediaResponse">;

export type MediaBindingInput = Omit<
  Schema<"BindMediaBody">,
  "home_id" | "terminal_id" | "member_id"
>;

export type MediaBindingDto = Schema<"MediaBindingResponse">;

export type UnbindMediaInput = Omit<
  Schema<"UnbindMediaBody">,
  "home_id" | "terminal_id" | "member_id"
>;

export type BackupCreateInput = Omit<
  Schema<"BackupCreateBody">,
  "home_id" | "terminal_id" | "operator_id"
>;

export type BackupCreateDto = Schema<"BackupCreateResponse">;

export type BackupListDto = RequireFields<Schema<"BackupListResponse">, "items">;

export type BackupRestoreInput = Omit<
  Schema<"BackupRestoreBody">,
  "home_id" | "terminal_id" | "operator_id"
>;

export type BackupRestoreDto = Schema<"BackupRestoreResponse">;

export type FloorplanAssetDto = Schema<"FloorplanAssetResponse">;

export type EditorSessionDto = RequireFields<
  Schema<"EditorSessionResponse">,
  "lease_id" | "lease_expires_at" | "heartbeat_interval_seconds" | "draft_version" | "current_layout_version"
>;

export type EditorDraftDto = RequireFields<
  Schema<"EditorDraftResponse">,
  "draft_version" | "base_layout_version" | "layout"
>;

export type EditorDraftSaveHotspotInput = Schema<"EditorDraftSaveHotspotRequestBody">;

export type EditorDraftSaveInput = RequireFields<
  Omit<Schema<"EditorDraftSaveRequestBody">, "home_id" | "terminal_id" | "member_id">,
  "layout_meta" | "hotspots"
>;

export type EditorDraftSaveDto = Schema<"EditorDraftSaveResponse">;

export type EditorPublishInput = Omit<
  Schema<"EditorPublishRequestBody">,
  "home_id" | "terminal_id" | "member_id"
>;

export type EditorPublishDto = Schema<"EditorPublishResponse">;

export type PinVerifyInput = Omit<Schema<"PinVerifyRequestBody">, "member_id">;

export type PinVerifyDto = Schema<"PinVerifyResponse">;

export type PinSessionDto = RequireFields<Schema<"PinSessionResponse">, "pin_session_expires_at">;
