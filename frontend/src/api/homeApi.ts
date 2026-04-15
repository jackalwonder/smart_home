import { apiRequest } from "./httpClient";
import { HomeOverviewDto } from "./types";

export function fetchHomeOverview() {
  return apiRequest<HomeOverviewDto>("/api/v1/home/overview");
}
