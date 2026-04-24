import type { SettingsSectionViewModel } from "../../view-models/settings";

export type SettingsTaskFlowKey =
  | "new-terminal"
  | "replace-terminal"
  | "backup-restore";

interface SettingsTaskFlowStep {
  title: string;
  description: string;
  sectionKey: SettingsSectionViewModel["key"];
}

interface SettingsTaskFlowDefinition {
  key: SettingsTaskFlowKey;
  title: string;
  eyebrow: string;
  description: string;
  outcome: string;
  primarySection: SettingsSectionViewModel["key"];
  steps: SettingsTaskFlowStep[];
}

export const OPERATIONS_SECTION_KEYS: SettingsSectionViewModel["key"][] = [
  "delivery",
  "backup",
];

const CURRENT_SETTINGS_SECTION_KEYS = new Set<SettingsSectionViewModel["key"]>([
  "home",
  "system",
  "delivery",
  "backup",
]);

const LEGACY_HOME_SECTION_KEYS = new Set([
  "favorites",
  "home-advanced",
  "page",
  "function",
]);

const SETTINGS_TASK_FLOWS: SettingsTaskFlowDefinition[] = [
  {
    key: "new-terminal",
    title: "新装终端",
    eyebrow: "安装交付",
    description: "适合全新终端首次入场，先认领绑定码，再交付激活凭据。",
    outcome: "让新终端在现场一次激活成功，并自动拿到后续访问权限。",
    primarySection: "delivery",
    steps: [
      {
        title: "确认系统已就绪",
        description:
          "如需现场排障，先检查 Home Assistant、能耗和默认媒体等系统连接。",
        sectionKey: "system",
      },
      {
        title: "认领绑定码",
        description: "在终端交付里录入终端展示的一次性绑定码，确认安装归属。",
        sectionKey: "delivery",
      },
      {
        title: "交付激活凭据",
        description:
          "生成并交付一次性激活凭据，优先使用二维码，其次激活链接或激活码。",
        sectionKey: "delivery",
      },
    ],
  },
  {
    key: "replace-terminal",
    title: "换机恢复",
    eyebrow: "现场恢复",
    description: "适合旧终端损坏、重装系统或更换硬件后的快速恢复。",
    outcome: "为目标终端重置新的激活凭据，让替换设备尽快重新上线。",
    primarySection: "delivery",
    steps: [
      {
        title: "核对目标终端",
        description:
          "先在终端交付里确认当前待恢复的终端身份，避免把凭据发错设备。",
        sectionKey: "delivery",
      },
      {
        title: "重置激活凭据",
        description: "为该终端重新签发一次性激活凭据，旧凭据会立即失效。",
        sectionKey: "delivery",
      },
      {
        title: "必要时复查系统连接",
        description:
          "终端重新上线后，如发现联动异常，可回到系统连接检查外部服务状态。",
        sectionKey: "system",
      },
    ],
  },
  {
    key: "backup-restore",
    title: "备份恢复",
    eyebrow: "版本回退",
    description: "适合配置回退、现场恢复点切换以及恢复后的版本核对。",
    outcome: "从可用恢复点还原设置与布局，并保留完整的恢复审计记录。",
    primarySection: "backup",
    steps: [
      {
        title: "选择或创建恢复点",
        description: "先确认现有备份是否可用，必要时创建新的恢复点再开始回退。",
        sectionKey: "backup",
      },
      {
        title: "执行恢复",
        description:
          "对目标备份执行恢复，记录新的 settings_version 与 layout_version。",
        sectionKey: "backup",
      },
      {
        title: "恢复后复核",
        description:
          "恢复完成后，可回到系统连接或终端交付确认现场状态是否已经回稳。",
        sectionKey: "system",
      },
    ],
  },
];

export function getSettingsTaskFlow(flowKey: SettingsTaskFlowKey) {
  return (
    SETTINGS_TASK_FLOWS.find((flow) => flow.key === flowKey) ??
    SETTINGS_TASK_FLOWS[0]
  );
}

export function normalizeSettingsSectionKey(
  value: string | null,
): SettingsSectionViewModel["key"] {
  if (!value) {
    return "home";
  }

  if (CURRENT_SETTINGS_SECTION_KEYS.has(value as SettingsSectionViewModel["key"])) {
    return value as SettingsSectionViewModel["key"];
  }

  // Legacy section query values from the pre-home-governance settings UI.
  if (LEGACY_HOME_SECTION_KEYS.has(value)) {
    return "home";
  }

  return "home";
}

interface SettingsOperationsWorkflowProps {
  activeFlow: SettingsTaskFlowKey;
  activeSection: SettingsSectionViewModel["key"];
  onSelectSection: (key: SettingsSectionViewModel["key"]) => void;
  onSelectFlow: (key: SettingsTaskFlowKey) => void;
  sections: SettingsSectionViewModel[];
}

export function SettingsOperationsWorkflow({
  activeFlow,
  activeSection,
  onSelectSection,
  onSelectFlow,
  sections,
}: SettingsOperationsWorkflowProps) {
  const activeFlowConfig = getSettingsTaskFlow(activeFlow);
  const sectionLabels = new Map(
    sections.map((section) => [section.key, section.label]),
  );

  return (
    <section
      className="utility-card settings-task-flow"
      aria-label="现场任务流"
    >
      <div className="settings-task-flow__header">
        <div>
          <span className="card-eyebrow">现场任务流</span>
          <h3>按场景进入，不用自己拼操作顺序</h3>
          <p className="muted-copy">
            把“系统连接 / 终端交付 /
            备份恢复”还原成现场真正会遇到的三个任务入口。
          </p>
        </div>
        <p className="settings-task-flow__summary">
          {activeFlowConfig.outcome}
        </p>
      </div>

      <div className="settings-task-flow__cards">
        {SETTINGS_TASK_FLOWS.map((flow) => (
          <button
            className={
              flow.key === activeFlow
                ? "settings-task-flow__card is-active"
                : "settings-task-flow__card"
            }
            key={flow.key}
            onClick={() => onSelectFlow(flow.key)}
            type="button"
          >
            <span className="settings-task-flow__card-tag">{flow.eyebrow}</span>
            <strong>{flow.title}</strong>
            <p>{flow.description}</p>
            <small>{flow.outcome}</small>
          </button>
        ))}
      </div>

      <ol
        className="settings-task-flow__steps"
        aria-label={`${activeFlowConfig.title}步骤`}
      >
        {activeFlowConfig.steps.map((step, index) => (
          <li
            className={
              step.sectionKey === activeSection
                ? "settings-task-flow__step is-current"
                : "settings-task-flow__step"
            }
            key={`${activeFlowConfig.key}-${step.title}`}
          >
            <div className="settings-task-flow__step-copy">
              <span className="settings-task-flow__step-index">
                {index + 1}
              </span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </div>
            <button
              className="button button--ghost settings-task-flow__step-action"
              onClick={() => onSelectSection(step.sectionKey)}
              type="button"
            >
              进入{sectionLabels.get(step.sectionKey) ?? step.sectionKey}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
