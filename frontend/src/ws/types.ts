import type { RealtimeContractBundle } from "./realtime.generated";

export type WsEvent = RealtimeContractBundle["server_event"];
export type WsClientMessage = RealtimeContractBundle["client_message"];
