import { PolicyEntryDraft, PolicyEntryDraftType, StructuredPolicyEditor } from "./StructuredPolicyEditor";
import { SettingsModuleCard } from "./SettingsModuleCard";

type PolicyKey = "homepageDisplayPolicy" | "iconPolicy" | "layoutPreference";

interface PageSettingsPanelProps {
  draft: {
    roomLabelMode: string;
    homepageDisplayPolicy: PolicyEntryDraft[];
    iconPolicy: PolicyEntryDraft[];
    layoutPreference: PolicyEntryDraft[];
  };
  onChangeRoomLabelMode: (value: string) => void;
  onSetPolicyValue: (
    policy: PolicyKey,
    key: string,
    type: PolicyEntryDraftType,
    value: string,
  ) => void;
  onChangePolicyEntry: (
    policy: PolicyKey,
    index: number,
    field: "key" | "type" | "value",
    value: string,
  ) => void;
  onAddPolicyEntry: (policy: PolicyKey) => void;
  onRemovePolicyEntry: (policy: PolicyKey, index: number) => void;
}

const knownHomepageKeys = [
  "show_weather",
  "show_energy",
  "show_media",
  "show_favorites",
  "stage_density",
  "spotlight_room",
] as const;

const knownIconKeys = [
  "use_device_icon",
  "highlight_active_devices",
  "icon_theme",
  "active_glow_color",
  "sensor_tone_color",
  "fallback_icon",
] as const;

const knownLayoutKeys = [
  "default_floor",
  "sidebar_mode",
  "hotspot_scale",
  "stage_zoom",
  "show_grid_overlay",
  "animation_level",
] as const;

function findEntry(entries: PolicyEntryDraft[], key: string) {
  return entries.find((entry) => entry.key === key) ?? null;
}

function getBoolean(entries: PolicyEntryDraft[], key: string, fallback = false) {
  const entry = findEntry(entries, key);
  if (!entry) {
    return fallback;
  }
  return entry.value === "true";
}

function getString(entries: PolicyEntryDraft[], key: string, fallback = "") {
  return findEntry(entries, key)?.value ?? fallback;
}

function getUnknownEntries(entries: PolicyEntryDraft[], knownKeys: readonly string[]) {
  return entries.filter((entry) => !knownKeys.includes(entry.key));
}

function findOriginalIndex(entries: PolicyEntryDraft[], entryId: string) {
  return entries.findIndex((entry) => entry.id === entryId);
}

export function PageSettingsPanel({
  draft,
  onChangeRoomLabelMode,
  onSetPolicyValue,
  onChangePolicyEntry,
  onAddPolicyEntry,
  onRemovePolicyEntry,
}: PageSettingsPanelProps) {
  const homepageUnknownEntries = getUnknownEntries(draft.homepageDisplayPolicy, knownHomepageKeys);
  const iconUnknownEntries = getUnknownEntries(draft.iconPolicy, knownIconKeys);
  const layoutUnknownEntries = getUnknownEntries(draft.layoutPreference, knownLayoutKeys);

  return (
    <SettingsModuleCard
      description="这里控制首页显示、图标语义以及画布布局偏好。"
      eyebrow="页面策略"
      title="页面设置"
    >
      <div className="settings-form-grid">
        <label className="form-field">
          <span>房间标签模式</span>
          <select
            className="control-input"
            onChange={(event) => onChangeRoomLabelMode(event.target.value)}
            value={draft.roomLabelMode}
          >
            <option value="EDIT_ONLY">仅编辑态显示</option>
            <option value="ALWAYS_SHOW">始终显示</option>
            <option value="HIDDEN">隐藏</option>
          </select>
        </label>

        <section className="policy-preset-panel form-field--full">
          <div className="policy-preset-panel__header">
            <div>
              <span className="card-eyebrow">首页展示</span>
              <h4>首页展示策略</h4>
              <p className="muted-copy">控制首页右侧卡片、舞台密度和默认聚焦房间。</p>
            </div>
          </div>
          <div className="settings-form-grid">
            <label className="toggle-field toggle-field--panel">
              <input
                checked={getBoolean(draft.homepageDisplayPolicy, "show_weather", true)}
                onChange={(event) =>
                  onSetPolicyValue(
                    "homepageDisplayPolicy",
                    "show_weather",
                    "boolean",
                    String(event.target.checked),
                  )
                }
                type="checkbox"
              />
              <span>首页显示天气</span>
            </label>
            <label className="toggle-field toggle-field--panel">
              <input
                checked={getBoolean(draft.homepageDisplayPolicy, "show_energy", false)}
                onChange={(event) =>
                  onSetPolicyValue(
                    "homepageDisplayPolicy",
                    "show_energy",
                    "boolean",
                    String(event.target.checked),
                  )
                }
                type="checkbox"
              />
              <span>首页显示能耗</span>
            </label>
            <label className="toggle-field toggle-field--panel">
              <input
                checked={getBoolean(draft.homepageDisplayPolicy, "show_media", false)}
                onChange={(event) =>
                  onSetPolicyValue(
                    "homepageDisplayPolicy",
                    "show_media",
                    "boolean",
                    String(event.target.checked),
                  )
                }
                type="checkbox"
              />
              <span>首页显示媒体</span>
            </label>
            <label className="toggle-field toggle-field--panel">
              <input
                checked={getBoolean(draft.homepageDisplayPolicy, "show_favorites", true)}
                onChange={(event) =>
                  onSetPolicyValue(
                    "homepageDisplayPolicy",
                    "show_favorites",
                    "boolean",
                    String(event.target.checked),
                  )
                }
                type="checkbox"
              />
              <span>首页显示收藏快捷入口</span>
            </label>
            <label className="form-field">
              <span>舞台密度</span>
              <select
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue(
                    "homepageDisplayPolicy",
                    "stage_density",
                    "string",
                    event.target.value,
                  )
                }
                value={getString(draft.homepageDisplayPolicy, "stage_density", "immersive")}
              >
                <option value="relaxed">舒展</option>
                <option value="compact">紧凑</option>
                <option value="immersive">沉浸</option>
              </select>
            </label>
            <label className="form-field">
              <span>默认聚焦房间</span>
              <input
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue(
                    "homepageDisplayPolicy",
                    "spotlight_room",
                    "string",
                    event.target.value,
                  )
                }
                placeholder="例如 living_room"
                value={getString(draft.homepageDisplayPolicy, "spotlight_room")}
              />
            </label>
          </div>
        </section>

        <section className="policy-preset-panel">
          <div className="policy-preset-panel__header">
            <div>
              <span className="card-eyebrow">图标语义</span>
              <h4>图标策略</h4>
              <p className="muted-copy">控制热点图标样式、激活态高亮和兜底图标。</p>
            </div>
          </div>
          <div className="settings-form-grid">
            <label className="toggle-field toggle-field--panel">
              <input
                checked={getBoolean(draft.iconPolicy, "use_device_icon", true)}
                onChange={(event) =>
                  onSetPolicyValue("iconPolicy", "use_device_icon", "boolean", String(event.target.checked))
                }
                type="checkbox"
              />
              <span>优先使用设备图标</span>
            </label>
            <label className="toggle-field toggle-field--panel">
              <input
                checked={getBoolean(draft.iconPolicy, "highlight_active_devices", true)}
                onChange={(event) =>
                  onSetPolicyValue(
                    "iconPolicy",
                    "highlight_active_devices",
                    "boolean",
                    String(event.target.checked),
                  )
                }
                type="checkbox"
              />
              <span>高亮激活设备</span>
            </label>
            <label className="form-field">
              <span>图标主题</span>
              <select
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue("iconPolicy", "icon_theme", "string", event.target.value)
                }
                value={getString(draft.iconPolicy, "icon_theme", "neon")}
              >
                <option value="outline">线框</option>
                <option value="filled">实体</option>
                <option value="neon">霓虹</option>
              </select>
            </label>
            <label className="form-field">
              <span>激活高亮色</span>
              <input
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue("iconPolicy", "active_glow_color", "string", event.target.value)
                }
                placeholder="#ffb357"
                value={getString(draft.iconPolicy, "active_glow_color", "#ffb357")}
              />
            </label>
            <label className="form-field">
              <span>传感器强调色</span>
              <input
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue("iconPolicy", "sensor_tone_color", "string", event.target.value)
                }
                placeholder="#4ed1c4"
                value={getString(draft.iconPolicy, "sensor_tone_color", "#4ed1c4")}
              />
            </label>
            <label className="form-field">
              <span>兜底图标代号</span>
              <input
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue("iconPolicy", "fallback_icon", "string", event.target.value)
                }
                placeholder="如 device"
                value={getString(draft.iconPolicy, "fallback_icon", "device")}
              />
            </label>
          </div>
        </section>

        <section className="policy-preset-panel">
          <div className="policy-preset-panel__header">
            <div>
              <span className="card-eyebrow">画布偏好</span>
              <h4>布局偏好</h4>
              <p className="muted-copy">控制楼层、缩放、侧栏模式和动画等级。</p>
            </div>
          </div>
          <div className="settings-form-grid">
            <label className="form-field">
              <span>默认楼层</span>
              <input
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue(
                    "layoutPreference",
                    "default_floor",
                    "string",
                    event.target.value,
                  )
                }
                placeholder="例如 floor_1"
                value={getString(draft.layoutPreference, "default_floor")}
              />
            </label>
            <label className="form-field">
              <span>侧栏模式</span>
              <select
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue(
                    "layoutPreference",
                    "sidebar_mode",
                    "string",
                    event.target.value,
                  )
                }
                value={getString(draft.layoutPreference, "sidebar_mode", "rail")}
              >
                <option value="rail">纵向情报栏</option>
                <option value="stacked">堆叠卡片</option>
                <option value="compact">紧凑模式</option>
              </select>
            </label>
            <label className="form-field">
              <span>热点缩放</span>
              <input
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue(
                    "layoutPreference",
                    "hotspot_scale",
                    "number",
                    event.target.value,
                  )
                }
                type="number"
                value={getString(draft.layoutPreference, "hotspot_scale", "1")}
              />
            </label>
            <label className="form-field">
              <span>舞台缩放</span>
              <input
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue("layoutPreference", "stage_zoom", "number", event.target.value)
                }
                type="number"
                value={getString(draft.layoutPreference, "stage_zoom", "1")}
              />
            </label>
            <label className="toggle-field toggle-field--panel">
              <input
                checked={getBoolean(draft.layoutPreference, "show_grid_overlay", false)}
                onChange={(event) =>
                  onSetPolicyValue(
                    "layoutPreference",
                    "show_grid_overlay",
                    "boolean",
                    String(event.target.checked),
                  )
                }
                type="checkbox"
              />
              <span>显示网格辅助层</span>
            </label>
            <label className="form-field">
              <span>动画等级</span>
              <select
                className="control-input"
                onChange={(event) =>
                  onSetPolicyValue(
                    "layoutPreference",
                    "animation_level",
                    "string",
                    event.target.value,
                  )
                }
                value={getString(draft.layoutPreference, "animation_level", "standard")}
              >
                <option value="subtle">轻微</option>
                <option value="standard">标准</option>
                <option value="cinematic">强化</option>
              </select>
            </label>
          </div>
        </section>

        <div className="form-field form-field--full">
          <span>扩展首页字段</span>
          <StructuredPolicyEditor
            description="不在预设里的首页策略可以继续在这里补充。"
            entries={homepageUnknownEntries}
            onAddEntry={() => onAddPolicyEntry("homepageDisplayPolicy")}
            onChangeEntry={(index, field, value) => {
              const originalIndex = findOriginalIndex(
                draft.homepageDisplayPolicy,
                homepageUnknownEntries[index].id,
              );
              if (originalIndex >= 0) {
                onChangePolicyEntry("homepageDisplayPolicy", originalIndex, field, value);
              }
            }}
            onRemoveEntry={(index) => {
              const originalIndex = findOriginalIndex(
                draft.homepageDisplayPolicy,
                homepageUnknownEntries[index].id,
              );
              if (originalIndex >= 0) {
                onRemovePolicyEntry("homepageDisplayPolicy", originalIndex);
              }
            }}
            title="首页扩展字段"
          />
        </div>
        <div className="form-field">
          <span>扩展图标字段</span>
          <StructuredPolicyEditor
            description="仅当预设控件不够时，再用这里补充特殊图标策略。"
            entries={iconUnknownEntries}
            onAddEntry={() => onAddPolicyEntry("iconPolicy")}
            onChangeEntry={(index, field, value) => {
              const originalIndex = findOriginalIndex(draft.iconPolicy, iconUnknownEntries[index].id);
              if (originalIndex >= 0) {
                onChangePolicyEntry("iconPolicy", originalIndex, field, value);
              }
            }}
            onRemoveEntry={(index) => {
              const originalIndex = findOriginalIndex(draft.iconPolicy, iconUnknownEntries[index].id);
              if (originalIndex >= 0) {
                onRemovePolicyEntry("iconPolicy", originalIndex);
              }
            }}
            title="图标扩展字段"
          />
        </div>
        <div className="form-field">
          <span>扩展布局字段</span>
          <StructuredPolicyEditor
            description="仅当预设控件不够时，再用这里补充特殊布局参数。"
            entries={layoutUnknownEntries}
            onAddEntry={() => onAddPolicyEntry("layoutPreference")}
            onChangeEntry={(index, field, value) => {
              const originalIndex = findOriginalIndex(
                draft.layoutPreference,
                layoutUnknownEntries[index].id,
              );
              if (originalIndex >= 0) {
                onChangePolicyEntry("layoutPreference", originalIndex, field, value);
              }
            }}
            onRemoveEntry={(index) => {
              const originalIndex = findOriginalIndex(
                draft.layoutPreference,
                layoutUnknownEntries[index].id,
              );
              if (originalIndex >= 0) {
                onRemovePolicyEntry("layoutPreference", originalIndex);
              }
            }}
            title="布局扩展字段"
          />
        </div>
      </div>
    </SettingsModuleCard>
  );
}
