import { asArray, asBoolean, asRecord, asString } from "./utils";

export interface SettingsSectionViewModel {
  key: "home" | "system" | "delivery" | "backup";
  label: string;
  eyebrow: string;
  description: string;
}

export interface SettingsFieldViewModel {
  label: string;
  value: string;
}

export interface SettingsViewModel {
  version: string;
  pinRequired: boolean;
  sections: SettingsSectionViewModel[];
  overview: SettingsFieldViewModel[];
}

export function mapSettingsViewModel(
  value: Record<string, unknown> | null,
): SettingsViewModel {
  const system = asRecord(value?.system_settings_summary);
  const favorites = asArray<Record<string, unknown>>(value?.favorites);

  return {
    version: asString(value?.settings_version ?? "settings_v1"),
    pinRequired: asBoolean(value?.pin_session_required, true),
    sections: [
      {
        key: "home",
        label: "首页治理",
        eyebrow: "首页内容与发布",
        description:
          "统一管理首页内容、首页规则和布局发布。总览页负责轻编辑，这里负责治理和高级配置。",
      },
      {
        key: "system",
        label: "系统连接",
        eyebrow: "外部服务接入",
        description:
          "统一处理 Home Assistant、能耗服务、国网登录和默认媒体等外部接入能力。",
      },
      {
        key: "delivery",
        label: "终端交付",
        eyebrow: "安装与恢复",
        description:
          "处理终端认领、激活凭据交付以及换机恢复等现场任务。",
      },
      {
        key: "backup",
        label: "备份与恢复",
        eyebrow: "版本回退",
        description:
          "创建设置与布局快照，查看恢复记录，并在需要时执行恢复。",
      },
    ],
    overview: [
      { label: "设置版本", value: asString(value?.settings_version ?? "-") },
      {
        label: "需要 PIN",
        value: asBoolean(value?.pin_session_required, true) ? "是" : "否",
      },
      {
        label: "系统连接",
        value: asBoolean(system?.system_connections_configured) ? "已配置" : "待配置",
      },
      {
        label: "能耗绑定",
        value: asString(system?.energy_binding_status ?? "-"),
      },
      {
        label: "默认媒体",
        value: asString(system?.default_media_binding_status ?? "-"),
      },
      { label: "首页常用设备", value: String(favorites.length) },
    ],
  };
}
