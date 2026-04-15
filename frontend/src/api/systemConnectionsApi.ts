import {
  SystemConnectionSaveDto,
  SystemConnectionSaveInput,
  SystemConnectionTestDto,
  SystemConnectionTestInput,
  SystemConnectionsEnvelopeDto,
} from "./types";
import { apiRequest } from "./httpClient";

export function fetchSystemConnections() {
  return apiRequest<SystemConnectionsEnvelopeDto>("/api/v1/system-connections");
}

export function saveHomeAssistantConnection(input: SystemConnectionSaveInput) {
  return apiRequest<SystemConnectionSaveDto>("/api/v1/system-connections/home-assistant", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function testHomeAssistantConnection(input: SystemConnectionTestInput) {
  return apiRequest<SystemConnectionTestDto>("/api/v1/system-connections/home-assistant/test", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
