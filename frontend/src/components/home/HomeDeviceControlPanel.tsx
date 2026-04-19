import { useEffect, useMemo, useState } from "react";
import {
  acceptDeviceControl,
  fetchDeviceControlResult,
} from "../../api/deviceControlsApi";
import { fetchDeviceDetail } from "../../api/devicesApi";
import { normalizeApiError } from "../../api/httpClient";
import {
  DeviceControlAcceptedDto,
  DeviceControlResultDto,
  DeviceControlSchemaItemDto,
  DeviceDetailDto,
} from "../../api/types";
import { HomeHotspotViewModel } from "../../view-models/home";

interface HomeDeviceControlPanelProps {
  hotspot: HomeHotspotViewModel;
  onClose: () => void;
}

function makeRequestId(deviceId: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `home-ui-${deviceId}-${suffix}`;
}

function schemaKey(schema: DeviceControlSchemaItemDto, index: number) {
  return `${schema.action_type}:${schema.target_scope ?? ""}:${schema.target_key ?? ""}:${index}`;
}

function normalizeKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function labelizeCode(value: string | null | undefined, fallback = "默认") {
  const source = value?.trim();
  if (!source) {
    return fallback;
  }
  return source
    .replace(/[_./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getRangeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function formatRuntimeState(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "暂无状态";
  }

  const normalized = String(value).toLowerCase();
  if (["on", "open", "running", "active", "true"].includes(normalized)) {
    return "运行中";
  }
  if (["off", "closed", "idle", "inactive", "false"].includes(normalized)) {
    return "已关闭";
  }
  if (normalized === "online") {
    return "在线";
  }
  if (normalized === "offline" || normalized === "unavailable") {
    return "离线";
  }
  return labelizeCode(String(value), "暂无状态");
}

function formatDeviceType(value: string | null | undefined) {
  const normalized = normalizeKeyword(value);
  if (normalized.includes("light") || normalized.includes("lamp")) {
    return "灯光";
  }
  if (normalized.includes("switch")) {
    return "开关";
  }
  if (normalized.includes("climate") || normalized.includes("air")) {
    return "空调";
  }
  if (normalized.includes("fan")) {
    return "风扇";
  }
  if (normalized.includes("cover") || normalized.includes("curtain")) {
    return "窗帘";
  }
  if (normalized.includes("media") || normalized.includes("tv")) {
    return "媒体设备";
  }
  if (normalized.includes("sensor")) {
    return "传感器";
  }
  return value ? labelizeCode(value, "设备") : "设备";
}

function getInitialValue(schema: DeviceControlSchemaItemDto): unknown {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return null;
  }

  if (
    Array.isArray(schema.allowed_values) &&
    schema.allowed_values.length > 0
  ) {
    return schema.allowed_values[0];
  }

  const min = getRangeNumber(schema.value_range?.min);
  if (min !== undefined) {
    return min;
  }

  if (type.includes("BOOL")) {
    return true;
  }
  if (schema.action_type.toUpperCase().includes("POWER")) {
    return true;
  }
  return "";
}

function normalizeControlValue(
  schema: DeviceControlSchemaItemDto,
  value: unknown,
): unknown {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return null;
  }
  if (
    type.includes("BOOL") ||
    schema.action_type.toUpperCase().includes("POWER")
  ) {
    return Boolean(value);
  }
  if (
    schema.value_range ||
    type.includes("NUMBER") ||
    type.includes("INT") ||
    type.includes("FLOAT")
  ) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

function isBooleanSchema(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  return (
    type.includes("BOOL") || schema.action_type.toUpperCase().includes("POWER")
  );
}

function isNumberSchema(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  return (
    Boolean(schema.value_range) ||
    type.includes("NUMBER") ||
    type.includes("INT") ||
    type.includes("FLOAT")
  );
}

function formatOptionLabel(value: unknown) {
  const normalized = normalizeKeyword(String(value));
  const map: Record<string, string> = {
    auto: "自动",
    cool: "制冷",
    heat: "制热",
    dry: "除湿",
    fan: "送风",
    high: "高",
    medium: "中",
    mid: "中",
    low: "低",
    eco: "节能",
    sleep: "睡眠",
    on: "开启",
    off: "关闭",
    open: "打开",
    close: "关闭",
    closed: "关闭",
    true: "开启",
    false: "关闭",
  };
  return map[normalized] ?? labelizeCode(String(value), String(value));
}

function describeAction(schema: DeviceControlSchemaItemDto) {
  const action = normalizeKeyword(schema.action_type);
  const target = normalizeKeyword(
    `${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  const source = `${action} ${target}`;

  if (source.includes("brightness")) {
    return {
      title: "亮度",
      helper: "调整灯光亮度后发送到设备。",
      submitText: "应用亮度",
      valueLabel: "亮度",
    };
  }
  if (source.includes("temperature") || source.includes("temp")) {
    return {
      title: "温度",
      helper: "设置目标温度，设备会按当前模式执行。",
      submitText: "应用温度",
      valueLabel: "目标温度",
    };
  }
  if (source.includes("fan_speed") || source.includes("speed")) {
    return {
      title: "风速",
      helper: "选择风速档位后发送到设备。",
      submitText: "应用风速",
      valueLabel: "风速",
    };
  }
  if (source.includes("mode")) {
    return {
      title: "模式",
      helper: "切换设备运行模式。",
      submitText: "切换模式",
      valueLabel: "模式",
    };
  }
  if (source.includes("position") || source.includes("cover")) {
    return {
      title: "开合位置",
      helper: "调整窗帘或覆盖设备的位置。",
      submitText: "应用位置",
      valueLabel: "位置",
    };
  }
  if (source.includes("scene") || source.includes("trigger")) {
    return {
      title: "执行场景",
      helper: "点击后会立即触发这个场景或按钮动作。",
      submitText: "执行场景",
      valueLabel: "触发动作",
    };
  }
  if (source.includes("power") || source.includes("toggle")) {
    return {
      title: "电源开关",
      helper: "切换设备开关状态。",
      submitText: "发送开关",
      valueLabel: "开关状态",
    };
  }
  return {
    title: labelizeCode(schema.action_type, "设备控制"),
    helper: "调整控制参数后发送到设备。",
    submitText: "发送控制",
    valueLabel: "控制取值",
  };
}

function describeTarget(schema: DeviceControlSchemaItemDto) {
  const scope = normalizeKeyword(schema.target_scope);
  const key = normalizeKeyword(schema.target_key);
  const keyMap: Record<string, string> = {
    primary: "主控",
    power: "电源",
    brightness: "亮度",
    temperature: "温度",
    target_temperature: "目标温度",
    mode: "模式",
    fan_speed: "风速",
    position: "位置",
    button_trigger: "按钮",
  };

  const parts = [scope, key]
    .filter(Boolean)
    .map((part) => keyMap[part] ?? labelizeCode(part));

  return parts.length ? parts.join(" / ") : "默认目标";
}

function describeValue(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return "无需额外取值";
  }
  if (
    Array.isArray(schema.allowed_values) &&
    schema.allowed_values.length > 0
  ) {
    return `${schema.allowed_values.length} 个可选值`;
  }
  if (schema.value_range) {
    const min = schema.value_range.min ?? "-";
    const max = schema.value_range.max ?? "-";
    return `${min} - ${max}${schema.unit ? ` ${schema.unit}` : ""}`;
  }
  return schema.value_type ?? "任意值";
}

function formatConfirmationType(value: string | null | undefined) {
  switch ((value ?? "").toUpperCase()) {
    case "ACK_DRIVEN":
      return "设备确认";
    case "STATE_DRIVEN":
      return "状态校验";
    case "FIRE_AND_FORGET":
      return "发送即完成";
    default:
      return value ? labelizeCode(value, "确认方式") : "默认确认";
  }
}

function renderControlInput(
  schema: DeviceControlSchemaItemDto,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  const action = describeAction(schema);
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return (
      <p className="home-device-control-panel__hint">
        这个动作不需要额外取值，点击执行即可。
      </p>
    );
  }

  if (
    Array.isArray(schema.allowed_values) &&
    schema.allowed_values.length > 0
  ) {
    return (
      <select
        className="control-input"
        onChange={(event) => onChange(event.target.value)}
        value={String(value ?? "")}
      >
        {schema.allowed_values.map((option) => (
          <option key={String(option)} value={String(option)}>
            {formatOptionLabel(option)}
          </option>
        ))}
      </select>
    );
  }

  if (isBooleanSchema(schema)) {
    return (
      <div
        aria-label={action.valueLabel}
        className="home-device-control-panel__segmented"
        role="group"
      >
        <button
          aria-label="开启"
          className={Boolean(value) ? "is-active" : ""}
          onClick={() => onChange(true)}
          type="button"
        >
          开启
        </button>
        <button
          aria-label="关闭"
          className={!Boolean(value) ? "is-active" : ""}
          onClick={() => onChange(false)}
          type="button"
        >
          关闭
        </button>
      </div>
    );
  }

  if (isNumberSchema(schema)) {
    const min = getRangeNumber(schema.value_range?.min);
    const max = getRangeNumber(schema.value_range?.max);
    const step = getRangeNumber(schema.value_range?.step) ?? 1;
    const hasSlider = min !== undefined && max !== undefined;
    return (
      <div className="home-device-control-panel__range">
        {hasSlider ? (
          <input
            aria-label={`${action.valueLabel}滑杆`}
            max={max}
            min={min}
            onChange={(event) => onChange(event.target.value)}
            step={step}
            type="range"
            value={String(value ?? min)}
          />
        ) : null}
        <label>
          <span>{schema.unit ? `单位 ${schema.unit}` : "数值"}</span>
          <input
            className="control-input"
            max={max}
            min={min}
            onChange={(event) => onChange(event.target.value)}
            step={step}
            type="number"
            value={String(value ?? "")}
          />
        </label>
      </div>
    );
  }

  return (
    <input
      className="control-input"
      onChange={(event) => onChange(event.target.value)}
      value={String(value ?? "")}
    />
  );
}

function formatControlError(error: unknown) {
  const apiError = normalizeApiError(error);
  switch (apiError.code) {
    case "INVALID_PARAMS":
      return apiError.message.includes("must be null")
        ? "当前控制项不需要取值，请刷新控制面板后重试。"
        : "控制参数不符合设备要求，请检查取值后重试。";
    case "VALUE_OUT_OF_RANGE":
      return "控制取值超出设备允许范围，请调整后重试。";
    case "UNSUPPORTED_ACTION":
      return "当前设备不支持这个控制动作，请刷新设备能力后重试。";
    case "UNSUPPORTED_TARGET":
      return "当前设备不支持这个控制目标，请切换控制项后重试。";
    case "DEVICE_NOT_FOUND":
      return "设备不存在或已经被移除，请刷新首页后重试。";
    case "NETWORK_ERROR":
      return "控制请求没有发到服务端，请检查连接后重试。";
    case "UNAUTHORIZED":
      return "当前登录已失效，请重新激活或刷新页面后重试。";
    default:
      return apiError.message;
  }
}

function formatResultStatus(status: string) {
  switch (status) {
    case "PENDING":
      return "等待设备确认";
    case "SUCCESS":
      return "控制已完成";
    case "FAILED":
      return "控制失败";
    case "TIMEOUT":
      return "控制超时";
    case "STATE_MISMATCH":
      return "状态未达到预期";
    default:
      return status;
  }
}

function describeResult(result: DeviceControlResultDto) {
  switch (result.execution_status) {
    case "SUCCESS":
      return {
        title: "设备已完成控制",
        detail: "设备已经返回确认，可以继续操作。",
      };
    case "FAILED":
      return {
        title: "设备没有完成控制",
        detail:
          result.error_message ?? "请检查 Home Assistant 连接和设备状态。",
      };
    case "TIMEOUT":
      return {
        title: "等待设备确认超时",
        detail: "设备可能离线或响应较慢，请稍后重试。",
      };
    case "STATE_MISMATCH":
      return {
        title: "设备状态未达到预期",
        detail: "控制已发送，但回读状态和目标不一致，请确认现场状态。",
      };
    case "PENDING":
      return {
        title: "正在等待设备确认",
        detail: "请求已进入队列，稍等片刻会自动刷新结果。",
      };
    default:
      return {
        title: formatResultStatus(result.execution_status),
        detail: "请根据设备状态确认本次控制结果。",
      };
  }
}

export function HomeDeviceControlPanel({
  hotspot,
  onClose,
}: HomeDeviceControlPanelProps) {
  const [device, setDevice] = useState<DeviceDetailDto | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [queryingResult, setQueryingResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<DeviceControlAcceptedDto | null>(
    null,
  );
  const [result, setResult] = useState<DeviceControlResultDto | null>(null);

  useEffect(() => {
    let active = true;
    setDevice(null);
    setSelectedIndex(0);
    setValues({});
    setAccepted(null);
    setResult(null);
    setError(null);
    setLoading(true);

    void (async () => {
      try {
        const detail = await fetchDeviceDetail(hotspot.deviceId);
        if (!active) {
          return;
        }
        const initialValues: Record<string, unknown> = {};
        detail.control_schema.forEach((schema, index) => {
          initialValues[schemaKey(schema, index)] = getInitialValue(schema);
        });
        setDevice(detail);
        setValues(initialValues);
      } catch (fetchError) {
        if (active) {
          setError(formatControlError(fetchError));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [hotspot.deviceId]);

  const schemas = device?.control_schema ?? [];
  const selectedSchema = schemas[selectedIndex] ?? null;
  const selectedKey = selectedSchema
    ? schemaKey(selectedSchema, selectedIndex)
    : "";
  const selectedValue = selectedKey ? values[selectedKey] : undefined;
  const selectedAction = selectedSchema ? describeAction(selectedSchema) : null;
  const resultPresentation = result ? describeResult(result) : null;
  const panelClass = useMemo(
    () =>
      [
        "home-device-control-panel",
        hotspot.x > 0.62 ? "is-left" : "is-right",
        hotspot.y > 0.58 ? "is-top" : "is-bottom",
      ].join(" "),
    [hotspot.x, hotspot.y],
  );

  async function submitControl() {
    if (!selectedSchema) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setAccepted(null);
    setResult(null);

    const requestId = makeRequestId(hotspot.deviceId);
    try {
      const acceptedResponse = await acceptDeviceControl({
        request_id: requestId,
        device_id: hotspot.deviceId,
        action_type: selectedSchema.action_type,
        payload: {
          target_scope: selectedSchema.target_scope,
          target_key: selectedSchema.target_key,
          value: normalizeControlValue(selectedSchema, selectedValue),
          unit: selectedSchema.unit,
        },
        client_ts: new Date().toISOString(),
      });
      setAccepted(acceptedResponse);
      setSubmitting(false);

      setQueryingResult(true);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, attempt === 0 ? 350 : 600),
        );
        const nextResult = await fetchDeviceControlResult(
          acceptedResponse.request_id,
        );
        setResult(nextResult);
        if (nextResult.execution_status !== "PENDING") {
          break;
        }
      }
    } catch (submitError) {
      setError(formatControlError(submitError));
    } finally {
      setSubmitting(false);
      setQueryingResult(false);
    }
  }

  return (
    <section
      className={panelClass}
      style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%` }}
    >
      <div className="home-device-control-panel__header">
        <div>
          <span>
            {formatDeviceType(device?.device_type ?? hotspot.deviceTypeLabel)}
          </span>
          <h3>{device?.display_name ?? hotspot.label}</h3>
        </div>
        <button
          aria-label="关闭控制面板"
          className="home-device-control-panel__close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>

      <div className="home-device-control-panel__status">
        <span>{device?.room_name ?? "未分配房间"}</span>
        <span>
          {formatRuntimeState(
            device?.runtime_state?.aggregated_state ?? hotspot.statusLabel,
          )}
        </span>
        <span>{device?.is_readonly_device ? "只读" : "可控制"}</span>
        {device?.is_offline ? <span>离线</span> : null}
      </div>

      {loading ? <p className="muted-copy">正在读取设备控制能力...</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {!loading && device?.is_readonly_device ? (
        <p className="muted-copy">当前设备是只读设备，不能发送控制请求。</p>
      ) : null}
      {!loading && device?.is_offline ? (
        <p className="muted-copy">当前设备离线，控制请求可能无法完成。</p>
      ) : null}

      {!loading && !schemas.length ? (
        <div className="home-device-control-panel__empty">
          <strong>暂时没有可用控制</strong>
          <p>可以在 Home Assistant 检查实体能力，或刷新设备同步后再试。</p>
        </div>
      ) : null}

      {selectedSchema && selectedAction ? (
        <div className="home-device-control-panel__form">
          <label className="form-field">
            <span>控制项</span>
            <select
              className="control-input"
              onChange={(event) => {
                setSelectedIndex(Number(event.target.value));
                setAccepted(null);
                setResult(null);
              }}
              value={selectedIndex}
            >
              {schemas.map((schema, index) => (
                <option key={schemaKey(schema, index)} value={index}>
                  {describeAction(schema).title}
                </option>
              ))}
            </select>
          </label>

          <div className="home-device-control-panel__action-summary">
            <strong>{selectedAction.title}</strong>
            <p>{selectedAction.helper}</p>
            <span>{describeTarget(selectedSchema)}</span>
          </div>

          <label className="form-field">
            <span>{selectedAction.valueLabel}</span>
            {renderControlInput(selectedSchema, selectedValue, (nextValue) => {
              setValues((current) => ({
                ...current,
                [selectedKey]: nextValue,
              }));
            })}
          </label>

          <div className="home-device-control-panel__meta">
            <span>{`取值 ${describeValue(selectedSchema)}`}</span>
            <span>{`确认 ${formatConfirmationType(device?.confirmation_type)}`}</span>
            <span>
              {selectedSchema.is_quick_action ? "快捷动作" : "详情动作"}
            </span>
            {selectedSchema.requires_detail_entry ? (
              <span>需要详情入口</span>
            ) : null}
          </div>

          <button
            className="button button--primary"
            disabled={
              submitting || queryingResult || device?.is_readonly_device
            }
            onClick={() => void submitControl()}
            type="button"
          >
            {queryingResult
              ? "等待设备确认..."
              : submitting
                ? "发送中..."
                : accepted
                  ? "重新发送"
                  : selectedAction.submitText}
          </button>
        </div>
      ) : null}

      {accepted ? (
        <div className="home-device-control-panel__result">
          <strong>请求已发送</strong>
          <p>正在等待设备确认，结果会自动刷新。</p>
          <span>{`请求 ${accepted.request_id}`}</span>
          <span>{`${formatConfirmationType(accepted.confirmation_type)} · ${accepted.timeout_seconds}s`}</span>
        </div>
      ) : null}

      {result && resultPresentation ? (
        <div
          className={`home-device-control-panel__result is-${result.execution_status.toLowerCase()}`}
        >
          <strong>{resultPresentation.title}</strong>
          <p>{resultPresentation.detail}</p>
          {result.error_code ? (
            <span>{`错误 ${result.error_code}`}</span>
          ) : null}
          {result.final_runtime_state ? <span>已收到设备回读状态</span> : null}
        </div>
      ) : null}
    </section>
  );
}
