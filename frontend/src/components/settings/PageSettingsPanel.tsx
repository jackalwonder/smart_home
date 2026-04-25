import { PolicyEntryDraft, PolicyEntryDraftType } from "./StructuredPolicyEditor";
import { SettingsModuleCard } from "./SettingsModuleCard";
import {
  HomepageDisplayPolicySection,
  IconPolicySection,
  LayoutPreferenceSection,
  PolicyExtensionEditor,
} from "./PageSettingsPolicySections";
import {
  PolicyKey,
  getUnknownEntries,
  knownHomepageKeys,
  knownIconKeys,
  knownLayoutKeys,
} from "./pageSettingsPolicyModel";

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

export function PageSettingsPanel({
  draft,
  onChangeRoomLabelMode,
  onSetPolicyValue,
  onChangePolicyEntry,
  onAddPolicyEntry,
  onRemovePolicyEntry,
}: PageSettingsPanelProps) {
  const homepageUnknownEntries = getUnknownEntries(
    draft.homepageDisplayPolicy,
    knownHomepageKeys,
  );
  const iconUnknownEntries = getUnknownEntries(draft.iconPolicy, knownIconKeys);
  const layoutUnknownEntries = getUnknownEntries(
    draft.layoutPreference,
    knownLayoutKeys,
  );

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

        <HomepageDisplayPolicySection
          entries={draft.homepageDisplayPolicy}
          onSetPolicyValue={onSetPolicyValue}
        />
        <IconPolicySection entries={draft.iconPolicy} onSetPolicyValue={onSetPolicyValue} />
        <LayoutPreferenceSection
          entries={draft.layoutPreference}
          onSetPolicyValue={onSetPolicyValue}
        />

        <PolicyExtensionEditor
          description="不在预设里的首页策略可以继续在这里补充。"
          entries={homepageUnknownEntries}
          label="扩展首页字段"
          onAddEntry={onAddPolicyEntry}
          onChangePolicyEntry={onChangePolicyEntry}
          onRemovePolicyEntry={onRemovePolicyEntry}
          originalEntries={draft.homepageDisplayPolicy}
          policy="homepageDisplayPolicy"
          title="首页扩展字段"
          wide
        />
        <PolicyExtensionEditor
          description="仅当预设控件不够时，再用这里补充特殊图标策略。"
          entries={iconUnknownEntries}
          label="扩展图标字段"
          onAddEntry={onAddPolicyEntry}
          onChangePolicyEntry={onChangePolicyEntry}
          onRemovePolicyEntry={onRemovePolicyEntry}
          originalEntries={draft.iconPolicy}
          policy="iconPolicy"
          title="图标扩展字段"
        />
        <PolicyExtensionEditor
          description="仅当预设控件不够时，再用这里补充特殊布局参数。"
          entries={layoutUnknownEntries}
          label="扩展布局字段"
          onAddEntry={onAddPolicyEntry}
          onChangePolicyEntry={onChangePolicyEntry}
          onRemovePolicyEntry={onRemovePolicyEntry}
          originalEntries={draft.layoutPreference}
          policy="layoutPreference"
          title="布局扩展字段"
        />
      </div>
    </SettingsModuleCard>
  );
}
