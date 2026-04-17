import { apiRequest } from "./httpClient";
import {
  BackupCreateDto,
  BackupCreateInput,
  BackupListDto,
  BackupRestoreAuditListDto,
  BackupRestoreDto,
  BackupRestoreInput,
} from "./types";

export function fetchBackups() {
  return apiRequest<BackupListDto>("/api/v1/system/backups");
}

export function fetchBackupRestoreAudits(limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiRequest<BackupRestoreAuditListDto>(`/api/v1/system/backups/restores?${params}`);
}

export function createBackup(input: BackupCreateInput) {
  return apiRequest<BackupCreateDto>("/api/v1/system/backups", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function restoreBackup(backupId: string, input: BackupRestoreInput = {}) {
  return apiRequest<BackupRestoreDto>(
    `/api/v1/system/backups/${encodeURIComponent(backupId)}/restore`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
