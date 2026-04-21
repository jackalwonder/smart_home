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

function normalizeKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function schemaKey(schema: DeviceControlSchemaItemDto, index: number) {
  return `${schema.action_type}:${schema.target_scope ?? ""}:${schema.target_key ?? ""}:${index}`;
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

function isBooleanSchema(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  return type.includes("BOOL") || normalizeKeyword(schema.action_type).includes("power");
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

function getInitialValue(schema: DeviceControlSchemaItemDto): unknown {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return null;
  }
  if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
    return schema.allowed_values[0];
  }
  const min = getRangeNumber(schema.value_range?.min);
  if (min !== undefined) {
    return min;
  }
  if (isBooleanSchema(schema)) {
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
  if (isBooleanSchema(schema)) {
    return Boolean(value);
  }
  if (isNumberSchema(schema)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

function formatStatus(value: unknown, offline?: boolean) {
  if (offline) {
    return "离线";
  }
  const normalized = normalizeKeyword(typeof value === "string" ? value : "");
  if (normalized.includes("on") || normalized.includes("open")) {
    return "已开启";
  }
  if (normalized.includes("running")) {
    return "运行中";
  }
  if (normalized.includes("off") || normalized.includes("closed")) {
    return "已关闭";
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "状态待更新";
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
    true: "开启",
    false: "关闭",
  };
  return map[normalized] ?? String(value);
}

function describeAction(schema: DeviceControlSchemaItemDto) {
  const source = normalizeKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  if (source.includes("brightness")) {
    return { title: "亮度", valueLabel: "亮度", submitText: "应用亮度" };
  }
  if (source.includes("temperature") || source.includes("temp")) {
    return { title: "温度", valueLabel: "目标温度", submitText: "应用温度" };
  }
  if (source.includes("mode")) {
    return { title: "模式", valueLabel: "模式", submitText: "切换模式" };
  }
  if (source.includes("fan_speed") || source.includes("speed")) {
    return { title: "风速", valueLabel: "风速", submitText: "应用风速" };
  }
  if (source.includes("position") || source.includes("cover")) {
    return { title: "开合位置", valueLabel: "位置", submitText: "应用位置" };
  }
  if (source.includes("scene") || source.includes("trigger") || source.includes("execute")) {
    return { title: "执行动作", valueLabel: "动作", submitText: "立即执行" };
  }
  if (source.includes("power") || source.includes("toggle")) {
    return { title: "电源开关", valueLabel: "开关状态", submitText: "发送开关" };
  }
  return { title: "设备控制", valueLabel: "控制值", submitText: "发送控制" };
}

function formatControlError(error: unknown) {
  const apiError = normalizeApiError(error);
  switch (apiError.code) {
    case "INVALID_PARAMS":
      return "控制参数不符合设备要求，请调整后重试。";
    case "VALUE_OUT_OF_RANGE":
      return "控制值超出设备允许范围，请重新调整。";
    case "UNSUPPORTED_ACTION":
      return "当前设备不支持这个控制动作。";
    case "UNSUPPORTED_TARGET":
      return "当前设备不支持这个控制目标。";
    case "DEVICE_NOT_FOUND":
      return "设备不存在或已被移除，请刷新首页后重试。";
    case "NETWORK_ERROR":
      return "控制请求没有到达服务端，请检查网络与服务状态。";
    case "UNAUTHORIZED":
      return "登录状态已失效，请刷新页面后重新进入。";
    default:
      return apiError.message;
  }
}

function describeResult(result: DeviceControlResultDto) {
  switch (result.execution_status) {
    case "SUCCESS":
      return "设备已完成控制";
    case "FAILED":
      return result.error_message ?? "设备没有完成这次控制";
    case "TIMEOUT":
      return "等待设备确认超时";
    case "STATE_MISMATCH":
      return "设备状态未达到预期";
    case "PENDING":
      return "正在等待设备确认";
    default:
      return result.execution_status;
  }
}

function toneLabel(tone: HomeHotspotViewModel["tone"]) {
  switch (tone) {
    case "warm":
      return "is-warm";
    case "neutral":
      return "is-neutral";
    default:
      return "is-accent";
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
    return <p className="home-device-control-panel__hint">这个动作不需要额外输入，直接执行即可。</p>;
  }

  if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
    return (
      <div className="home-device-control-panel__chips">
        {schema.allowed_values.map((option) => (
          <button
            aria-label={formatOptionLabel(option)}
            key={String(option)}
            className={value === option ? "is-active" : ""}
            onClick={() => onChange(option)}
            type="button"
          >
            {formatOptionLabel(option)}
          </button>
        ))}
      </div>
    );
  }

  if (isBooleanSchema(schema)) {
    return (
      <div className="home-device-control-panel__segmented" role="group" aria-label={action.valueLabel}>
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
    return (
      <div className="home-device-control-panel__range">
        {min !== undefined && max !== undefined ? (
          <input
            aria-label={`${action.valueLabel}滑杆`}
            max={max}
            min={min}
            onChange={(event) => onChange(Number(event.target.value))}
            step={step}
            type="range"
            value={Number(value ?? min)}
          />
        ) : null}
        <input
          aria-label={action.valueLabel}
          className="control-input"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="number"
          value={String(value ?? "")}
        />
        {schema.unit ? <small>{`单位 ${schema.unit}`}</small> : null}
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
  const [accepted, setAccepted] = useState<DeviceControlAcceptedDto | null>(null);
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
  const selectedKey = selectedSchema ? schemaKey(selectedSchema, selectedIndex) : "";
  const selectedValue = selectedKey ? values[selectedKey] : undefined;
  const selectedAction = selectedSchema ? describeAction(selectedSchema) : null;
  const powerSchemaIndex = schemas.findIndex(isBooleanSchema);
  const isSimpleQuickPanel = schemas.length <= 2 && powerSchemaIndex >= 0 && !hotspot.isComplex;
  const panelClass = useMemo(
    () =>
      [
        "home-device-control-panel",
        hotspot.x > 0.62 ? "is-left" : "is-right",
        hotspot.y > 0.42 ? "is-top" : "is-bottom",
      ].join(" "),
    [hotspot.x, hotspot.y],
  );

  async function submitControl(schema = selectedSchema, overrideValue?: unknown, index = selectedIndex) {
    if (!schema) {
      return;
    }

    setSubmitting(true);
    setQueryingResult(false);
    setAccepted(null);
    setResult(null);
    setError(null);

    const requestId = makeRequestId(hotspot.deviceId);
    try {
      const acceptedResponse = await acceptDeviceControl({
        request_id: requestId,
        device_id: hotspot.deviceId,
        action_type: schema.action_type,
        payload: {
          target_scope: schema.target_scope,
          target_key: schema.target_key,
          value: normalizeControlValue(
            schema,
            overrideValue ?? values[schemaKey(schema, index)],
          ),
          unit: schema.unit,
        },
        client_ts: new Date().toISOString(),
      });
      setAccepted(acceptedResponse);
      setSubmitting(false);
      setQueryingResult(true);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 320 : 580));
        const nextResult = await fetchDeviceControlResult(acceptedResponse.request_id);
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

  const quickSchema = powerSchemaIndex >= 0 ? schemas[powerSchemaIndex] : null;
  const quickStatus = formatStatus(
    device?.runtime_state?.aggregated_state ?? hotspot.statusSummary ?? hotspot.statusLabel,
    device?.is_offline,
  );

  return (
    <section
      className={panelClass}
      style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%` }}
    >
      <div className="home-device-control-panel__header">
        <div className="home-device-control-panel__title-group">
          <span
            className={[
              "home-device-control-panel__glyph",
              toneLabel(hotspot.tone),
            ].join(" ")}
            aria-hidden="true"
          >
            {hotspot.iconGlyph}
          </span>
          <div>
            <span>{device?.room_name ?? hotspot.deviceTypeLabel}</span>
            <h3>{device?.display_name ?? hotspot.label}</h3>
          </div>
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
        <span>{quickStatus}</span>
        <span>{device?.is_readonly_device ? "只读设备" : "可直接控制"}</span>
        {device?.is_offline ? <span>当前离线</span> : null}
      </div>

      {loading ? <p className="muted-copy">正在读取设备控制能力…</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}

      {!loading && isSimpleQuickPanel && quickSchema ? (
        <div className="home-device-control-panel__quick">
          <strong>快速控制</strong>
          <p>这个设备适合直接在热点旁完成开关操作。</p>
          <div className="home-device-control-panel__segmented">
            <button
              aria-label="开启"
              disabled={submitting || queryingResult || Boolean(device?.is_readonly_device)}
              onClick={() => void submitControl(quickSchema, true, powerSchemaIndex)}
              type="button"
            >
              开启
            </button>
            <button
              aria-label="关闭"
              disabled={submitting || queryingResult || Boolean(device?.is_readonly_device)}
              onClick={() => void submitControl(quickSchema, false, powerSchemaIndex)}
              type="button"
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !isSimpleQuickPanel && selectedSchema && selectedAction ? (
        <div className="home-device-control-panel__form">
          <label className="form-field">
            <span>控制项目</span>
            <select
              aria-label="控制项"
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
            <p>适合现场快速调整，发送后会自动等待设备确认。</p>
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

          <button
            className="button button--primary"
            disabled={submitting || queryingResult || Boolean(device?.is_readonly_device)}
            onClick={() => void submitControl()}
            type="button"
          >
            {queryingResult
              ? "等待设备确认…"
              : submitting
                ? "发送中…"
                : selectedAction.submitText}
          </button>
        </div>
      ) : null}

      {!loading && !schemas.length ? (
        <div className="home-device-control-panel__empty">
          <strong>暂无可用控制</strong>
          <p>这个热点现在只用于展示状态，后续接入更多控制能力后会自动升级。</p>
        </div>
      ) : null}

      {accepted ? (
        <div className="home-device-control-panel__result">
          <strong>请求已发送</strong>
          <p>{`请求号 ${accepted.request_id}`}</p>
        </div>
      ) : null}

      {result ? (
        <div
          className={`home-device-control-panel__result is-${result.execution_status.toLowerCase()}`}
        >
          <strong>{describeResult(result)}</strong>
          {result.error_code ? <p>{`错误码 ${result.error_code}`}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
