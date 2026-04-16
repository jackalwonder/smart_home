import type { RealtimeContractBundle } from "./realtime.generated";

export type WsEvent = RealtimeContractBundle["server_event"];
export type WsClientMessage = RealtimeContractBundle["client_message"];
export type WsEventType = WsEvent["event_type"];
export type WsChangeDomain = WsEvent["change_domain"];
