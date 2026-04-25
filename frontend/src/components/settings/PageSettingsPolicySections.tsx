import {
  PolicyEntryDraft,
  PolicyEntryDraftType,
  StructuredPolicyEditor,
} from "./StructuredPolicyEditor";
import {
  PolicyKey,
  findOriginalIndex,
  getBoolean,
  getString,
} from "./pageSettingsPolicyModel";

interface PolicySectionProps {
  entries: PolicyEntryDraft[];
  onSetPolicyValue: (
    policy: PolicyKey,
    key: string,
    type: PolicyEntryDraftType,
    value: string,
  ) => void;
}

interface ExtensionEditorProps {
  description: string;
  entries: PolicyEntryDraft[];
  label: string;
  onAddEntry: (policy: PolicyKey) => void;
  onChangePolicyEntry: (
    policy: PolicyKey,
    index: number,
    field: "key" | "type" | "value",
    value: string,
  ) => void;
  onRemovePolicyEntry: (policy: PolicyKey, index: number) => void;
  originalEntries: PolicyEntryDraft[];
  policy: PolicyKey;
  title: string;
  wide?: boolean;
}

export function HomepageDisplayPolicySection({
  entries,
  onSetPolicyValue,
}: PolicySectionProps) {
  return (
    <section className="policy-preset-panel form-field--full">
      <div className="policy-preset-panel__header">
        <div>
          <span className="card-eyebrow">首页展示</span>
          <h4>首页展示策略</h4>
          <p className="muted-copy">控制首页右侧卡片、舞台密度和默认聚焦房间。</p>
        </div>
      </div>
      <div className="settings-form-grid">
        <BooleanPolicyToggle
          checked={getBoolean(entries, "show_weather", true)}
          label="首页显示天气"
          onChange={(value) =>
            onSetPolicyValue("homepageDisplayPolicy", "show_weather", "boolean", value)
          }
        />
        <BooleanPolicyToggle
          checked={getBoolean(entries, "show_energy", false)}
          label="首页显示能耗"
          onChange={(value) =>
            onSetPolicyValue("homepageDisplayPolicy", "show_energy", "boolean", value)
          }
        />
        <BooleanPolicyToggle
          checked={getBoolean(entries, "show_media", false)}
          label="首页显示媒体"
          onChange={(value) =>
            onSetPolicyValue("homepageDisplayPolicy", "show_media", "boolean", value)
          }
        />
        <BooleanPolicyToggle
          checked={getBoolean(entries, "show_favorites", true)}
          label="首页显示常用设备入口"
          onChange={(value) =>
            onSetPolicyValue("homepageDisplayPolicy", "show_favorites", "boolean", value)
          }
        />
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
            value={getString(entries, "stage_density", "immersive")}
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
            value={getString(entries, "spotlight_room")}
          />
        </label>
      </div>
    </section>
  );
}

export function IconPolicySection({ entries, onSetPolicyValue }: PolicySectionProps) {
  return (
    <section className="policy-preset-panel">
      <div className="policy-preset-panel__header">
        <div>
          <span className="card-eyebrow">图标语义</span>
          <h4>图标策略</h4>
          <p className="muted-copy">控制热点图标样式、激活态高亮和兜底图标。</p>
        </div>
      </div>
      <div className="settings-form-grid">
        <BooleanPolicyToggle
          checked={getBoolean(entries, "use_device_icon", true)}
          label="优先使用设备图标"
          onChange={(value) =>
            onSetPolicyValue("iconPolicy", "use_device_icon", "boolean", value)
          }
        />
        <BooleanPolicyToggle
          checked={getBoolean(entries, "highlight_active_devices", true)}
          label="高亮激活设备"
          onChange={(value) =>
            onSetPolicyValue("iconPolicy", "highlight_active_devices", "boolean", value)
          }
        />
        <label className="form-field">
          <span>图标主题</span>
          <select
            className="control-input"
            onChange={(event) =>
              onSetPolicyValue("iconPolicy", "icon_theme", "string", event.target.value)
            }
            value={getString(entries, "icon_theme", "neon")}
          >
            <option value="outline">线框</option>
            <option value="filled">实体</option>
            <option value="neon">霓虹</option>
          </select>
        </label>
        <StringPolicyInput
          label="激活高亮色"
          onChange={(value) =>
            onSetPolicyValue("iconPolicy", "active_glow_color", "string", value)
          }
          placeholder="#ffb357"
          value={getString(entries, "active_glow_color", "#ffb357")}
        />
        <StringPolicyInput
          label="传感器强调色"
          onChange={(value) =>
            onSetPolicyValue("iconPolicy", "sensor_tone_color", "string", value)
          }
          placeholder="#4ed1c4"
          value={getString(entries, "sensor_tone_color", "#4ed1c4")}
        />
        <StringPolicyInput
          label="兜底图标代号"
          onChange={(value) =>
            onSetPolicyValue("iconPolicy", "fallback_icon", "string", value)
          }
          placeholder="如 device"
          value={getString(entries, "fallback_icon", "device")}
        />
      </div>
    </section>
  );
}

export function LayoutPreferenceSection({ entries, onSetPolicyValue }: PolicySectionProps) {
  return (
    <section className="policy-preset-panel">
      <div className="policy-preset-panel__header">
        <div>
          <span className="card-eyebrow">画布偏好</span>
          <h4>布局偏好</h4>
          <p className="muted-copy">控制楼层、缩放、侧栏模式和动画等级。</p>
        </div>
      </div>
      <div className="settings-form-grid">
        <StringPolicyInput
          label="默认楼层"
          onChange={(value) =>
            onSetPolicyValue("layoutPreference", "default_floor", "string", value)
          }
          placeholder="例如 floor_1"
          value={getString(entries, "default_floor")}
        />
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
            value={getString(entries, "sidebar_mode", "rail")}
          >
            <option value="rail">纵向情报栏</option>
            <option value="stacked">堆叠卡片</option>
            <option value="compact">紧凑模式</option>
          </select>
        </label>
        <NumberPolicyInput
          label="热点缩放"
          onChange={(value) =>
            onSetPolicyValue("layoutPreference", "hotspot_scale", "number", value)
          }
          value={getString(entries, "hotspot_scale", "1")}
        />
        <NumberPolicyInput
          label="舞台缩放"
          onChange={(value) =>
            onSetPolicyValue("layoutPreference", "stage_zoom", "number", value)
          }
          value={getString(entries, "stage_zoom", "1")}
        />
        <BooleanPolicyToggle
          checked={getBoolean(entries, "show_grid_overlay", false)}
          label="显示网格辅助层"
          onChange={(value) =>
            onSetPolicyValue("layoutPreference", "show_grid_overlay", "boolean", value)
          }
        />
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
            value={getString(entries, "animation_level", "standard")}
          >
            <option value="subtle">轻微</option>
            <option value="standard">标准</option>
            <option value="cinematic">强化</option>
          </select>
        </label>
      </div>
    </section>
  );
}

export function PolicyExtensionEditor({
  description,
  entries,
  label,
  onAddEntry,
  onChangePolicyEntry,
  onRemovePolicyEntry,
  originalEntries,
  policy,
  title,
  wide = false,
}: ExtensionEditorProps) {
  return (
    <div className={wide ? "form-field form-field--full" : "form-field"}>
      <span>{label}</span>
      <StructuredPolicyEditor
        description={description}
        entries={entries}
        onAddEntry={() => onAddEntry(policy)}
        onChangeEntry={(index, field, value) => {
          const originalIndex = findOriginalIndex(originalEntries, entries[index].id);
          if (originalIndex >= 0) {
            onChangePolicyEntry(policy, originalIndex, field, value);
          }
        }}
        onRemoveEntry={(index) => {
          const originalIndex = findOriginalIndex(originalEntries, entries[index].id);
          if (originalIndex >= 0) {
            onRemovePolicyEntry(policy, originalIndex);
          }
        }}
        title={title}
      />
    </div>
  );
}

function BooleanPolicyToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="toggle-field toggle-field--panel">
      <input
        checked={checked}
        onChange={(event) => onChange(String(event.target.checked))}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function StringPolicyInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        className="control-input"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function NumberPolicyInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        className="control-input"
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
    </label>
  );
}
