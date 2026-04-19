import {
  asArray,
  asBoolean,
  asRecord,
  asString,
  formatValue,
  labelize,
} from "./utils";

export interface SettingsSectionViewModel {
  key: "favorites" | "system" | "delivery" | "page" | "function" | "backup";
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
  favorites: SettingsFieldViewModel[];
  system: SettingsFieldViewModel[];
  page: SettingsFieldViewModel[];
  function: SettingsFieldViewModel[];
}

function mapFields(value: unknown): SettingsFieldViewModel[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }

  return Object.entries(record).map(([key, fieldValue]) => ({
    label: labelize(key),
    value: formatValue(fieldValue),
  }));
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
        key: "favorites",
        label: "首页入口管理",
        eyebrow: "首页编排",
        description:
          "管理首页常用设备、快捷入口开关和显示规则；设备浏览与排查留在设备页。",
      },
      {
        key: "system",
        label: "系统连接",
        eyebrow: "基础设施",
        description: "Home Assistant、能耗、媒体以及外部服务绑定。",
      },
      {
        key: "delivery",
        label: "终端交付",
        eyebrow: "安装恢复",
        description: "绑定码认领、激活凭据交付以及现场恢复入口。",
      },
      {
        key: "page",
        label: "页面策略",
        eyebrow: "空间布局",
        description: "户型资源、房间标签和页面展示策略。",
      },
      {
        key: "function",
        label: "功能策略",
        eyebrow: "行为规则",
        description: "阈值、自动返回和快捷入口相关规则。",
      },
      {
        key: "backup",
        label: "备份恢复",
        eyebrow: "恢复点",
        description: "创建设置和布局快照，查看恢复时间并触发恢复。",
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
        value: asBoolean(system?.system_connections_configured)
          ? "已配置"
          : "待配置",
      },
      {
        label: "能耗绑定",
        value: asString(system?.energy_binding_status ?? "-"),
      },
      {
        label: "媒体绑定",
        value: asString(system?.default_media_binding_status ?? "-"),
      },
      { label: "首页常用设备", value: String(favorites.length) },
    ],
    favorites:
      favorites.length > 0
        ? favorites.flatMap((item, index) =>
            Object.entries(item).map(([key, fieldValue]) => ({
              label: `${index + 1}. ${labelize(key)}`,
              value: formatValue(fieldValue),
            })),
          )
        : [{ label: "首页常用设备", value: "当前还没有加入首页的设备" }],
    system: mapFields(value?.system_settings_summary),
    page: mapFields(value?.page_settings),
    function: mapFields(value?.function_settings),
  };
}
