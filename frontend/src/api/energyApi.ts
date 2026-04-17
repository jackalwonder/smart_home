import { apiRequest } from "./httpClient";
import {
  EnergyBindingDto,
  EnergyBindingInput,
  EnergyDto,
  EnergyRefreshDto,
} from "./types";

export function fetchEnergy() {
  return apiRequest<EnergyDto>("/api/v1/energy");
}

export function saveEnergyBinding(input: EnergyBindingInput) {
  return apiRequest<EnergyBindingDto>("/api/v1/energy/binding", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function clearEnergyBinding(input: EnergyBindingInput = { payload: {} }) {
  return apiRequest<EnergyBindingDto>("/api/v1/energy/binding", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export function refreshEnergy() {
  return apiRequest<EnergyRefreshDto>("/api/v1/energy/refresh", {
    method: "POST",
    body: JSON.stringify({ payload: {} }),
  });
}
