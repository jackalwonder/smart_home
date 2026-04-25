import type {
  BackupListItemDto,
  DefaultMediaDto,
  EnergyDto,
  SgccLoginQrCodeStatusDto,
} from "../api/types";
import type { SettingsSectionViewModel } from "../view-models/settings";
import {
  formatSettingsStatus,
  getSettingsStatusTone,
  type SettingsStatusTone,
} from "./statusFormat";

export interface RuntimeCard {
  actionLabel: string;
  description: string;
  key: string;
  label: string;
  section: SettingsSectionViewModel["key"];
  status: string;
  targetId: string;
  tone: SettingsStatusTone;
}

export function formatCount(value: number, unit: string) {
  return `${value} ${unit}`;
}

export function formatShortTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

export function getSgccOverviewCopy(status: SgccLoginQrCodeStatusDto | null) {
  const phase = status?.phase ?? status?.status ?? "UNKNOWN";
  const accountCount = status?.account_count ?? 0;
  const latestAccount = formatShortTimestamp(status?.latest_account_timestamp);
  if (phase === "DATA_READY") {
    return {
      actionLabel: "查看国网账号",
      description: `已发现 ${accountCount} 个账号${
        latestAccount ? `，最新数据 ${latestAccount}` : ""
      }。二维码状态只作为扫码文件明细。`,
    };
  }
  if (phase === "FETCHING_DATA") {
    return {
      actionLabel: "查看拉取进度",
      description: "国网扫码已通过，正在拉取账号和电量数据。",
    };
  }
  if (phase === "QR_READY") {
    return {
      actionLabel: "去扫码",
      description: "二维码可扫码，请用国家电网 App 完成登录确认。",
    };
  }
  if (phase === "WAITING_FOR_SCAN") {
    return {
      actionLabel: "查看二维码",
      description: "登录流程正在等待扫码确认，二维码状态在详情里查看。",
    };
  }
  if (phase === "QR_EXPIRED" || phase === "EXPIRED") {
    return {
      actionLabel: "重新登录",
      description: "当前二维码文件已过期；如果没有可用账号缓存，需要重新生成二维码。",
    };
  }
  if (phase === "LOGIN_RUNNING") {
    return {
      actionLabel: "查看登录进度",
      description: "国网登录任务正在运行，二维码准备后会显示扫码入口。",
    };
  }
  return {
    actionLabel: "检查国网",
    description: "国网状态暂未获取，进入接入配置查看 sidecar 状态。",
  };
}

export function getEnergyOverviewCopy(
  energy: EnergyDto | null,
  sgccStatus: SgccLoginQrCodeStatusDto | null,
) {
  const bindingStatus = energy?.binding_status ?? "UNKNOWN";
  const phase = sgccStatus?.phase ?? sgccStatus?.status ?? "UNKNOWN";
  const sourceUpdatedAt = formatShortTimestamp(
    energy?.source_updated_at ?? energy?.system_updated_at ?? energy?.updated_at,
  );
  if (bindingStatus !== "BOUND") {
    return {
      actionLabel: phase === "DATA_READY" ? "绑定能耗账号" : "处理能耗",
      description:
        phase === "DATA_READY"
          ? "国网数据已就绪，下一步是把账号缓存绑定到首页能耗卡。"
          : "先确认国网账号缓存，再绑定能耗账号和 HA 实体。",
      status: formatSettingsStatus(bindingStatus, "connection"),
      tone: getSettingsStatusTone(bindingStatus, "connection"),
    };
  }
  if (energy?.refresh_status === "FAILED") {
    return {
      actionLabel: "查看刷新错误",
      description: energy.last_error_code
        ? `能耗已绑定，但最近刷新失败：${energy.last_error_code}。`
        : "能耗已绑定，但最近刷新失败，需要检查上游同步。",
      status: "刷新失败",
      tone: "danger" as SettingsStatusTone,
    };
  }
  if (energy?.refresh_status === "SUCCESS") {
    return {
      actionLabel: "刷新能耗",
      description: sourceUpdatedAt
        ? `能耗已绑定，最近数据更新时间 ${sourceUpdatedAt}。`
        : "能耗已绑定，最近刷新成功。",
      status: "能耗已同步",
      tone: "success" as SettingsStatusTone,
    };
  }
  return {
    actionLabel: "刷新能耗",
    description: "能耗已绑定，等待首次同步或手动刷新。",
    status: "等待同步",
    tone: "warning" as SettingsStatusTone,
  };
}

export function buildSettingsRuntimeCards(input: {
  backupItems: BackupListItemDto[];
  energyState: EnergyDto | null;
  mediaState: DefaultMediaDto | null;
  sgccLoginQrCode: SgccLoginQrCodeStatusDto | null;
  systemConnectionStatus: string;
  terminalTokenConfigured: boolean;
}): RuntimeCard[] {
  const sgccStatus =
    input.sgccLoginQrCode?.phase ?? input.sgccLoginQrCode?.status ?? "UNKNOWN";
  const mediaStatus = input.mediaState?.display_name
    ? input.mediaState.display_name
    : formatSettingsStatus(input.mediaState?.binding_status ?? "MEDIA_UNSET", "media");
  const sgccOverviewCopy = getSgccOverviewCopy(input.sgccLoginQrCode);
  const energyOverviewCopy = getEnergyOverviewCopy(input.energyState, input.sgccLoginQrCode);
  const backupReadyCount = input.backupItems.filter((item) => item.status === "READY").length;
  const terminalStatus = input.terminalTokenConfigured ? "已准备" : "待生成";

  return [
    {
      actionLabel: "检查接入",
      description: "HA 连接、测试配置和设备重载。",
      key: "ha",
      label: "Home Assistant",
      section: "integrations",
      status: formatSettingsStatus(input.systemConnectionStatus, "connection"),
      targetId: "settings-module-ha",
      tone: getSettingsStatusTone(input.systemConnectionStatus, "connection"),
    },
    {
      actionLabel: energyOverviewCopy.actionLabel,
      description: energyOverviewCopy.description,
      key: "energy",
      label: "能耗服务",
      section: "integrations",
      status: energyOverviewCopy.status,
      targetId: "settings-module-energy",
      tone: energyOverviewCopy.tone,
    },
    {
      actionLabel: "配置媒体",
      description: "默认播放设备和候选设备列表。",
      key: "media",
      label: "默认媒体",
      section: "integrations",
      status: mediaStatus,
      targetId: "settings-module-media",
      tone: getSettingsStatusTone(input.mediaState?.binding_status ?? "MEDIA_UNSET", "media"),
    },
    {
      actionLabel: sgccOverviewCopy.actionLabel,
      description: sgccOverviewCopy.description,
      key: "sgcc",
      label: "国网登录",
      section: "integrations",
      status: formatSettingsStatus(sgccStatus, "sgcc"),
      targetId: "settings-module-sgcc",
      tone: getSettingsStatusTone(sgccStatus, "sgcc"),
    },
    {
      actionLabel: "终端与权限",
      description: "PIN、绑定码认领和激活凭据。",
      key: "terminal",
      label: "终端与权限",
      section: "terminal",
      status: terminalStatus,
      targetId: "settings-module-terminal-pairing",
      tone: input.terminalTokenConfigured ? "success" : "warning",
    },
    {
      actionLabel: "查看备份",
      description: "恢复点、恢复审计和版本回退。",
      key: "backup",
      label: "备份恢复",
      section: "backup",
      status: `${backupReadyCount}/${input.backupItems.length} 可用`,
      targetId: "settings-module-backup",
      tone: input.backupItems.length ? "success" : "neutral",
    },
  ];
}
