import { apiRequest } from "./httpClient";
import {
  DefaultMediaDto,
  MediaBindingDto,
  MediaBindingInput,
  UnbindMediaInput,
} from "./types";

export function fetchDefaultMedia() {
  return apiRequest<DefaultMediaDto>("/api/v1/media/default");
}

export function bindDefaultMedia(input: MediaBindingInput) {
  return apiRequest<MediaBindingDto>("/api/v1/media/default/binding", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function unbindDefaultMedia(input: UnbindMediaInput = {}) {
  return apiRequest<MediaBindingDto>("/api/v1/media/default/binding", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}
