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

  if (type.includes("BOOL")) {
    return true;
  }
  if (schema.action_type.toUpperCase().includes("POWER")) {
    return true;
  }
  return "";
}

function normalizeControlValue(schema: DeviceControlSchemaItemDto, value: unknown): unknown {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return null;
  }
  if (type.includes("BOOL") || schema.action_type.toUpperCase().includes("POWER")) {
    return Boolean(value);
  }
  if (schema.value_range || type.includes("NUMBER") || type.includes("INT") || type.includes("FLOAT")) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

function describeValue(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return "无需取值";
  }
  if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
    return "枚举";
  }
  if (schema.value_range) {
    const min = schema.value_range.min ?? "-";
    const max = schema.value_range.max ?? "-";
    return `${min} - ${max}${schema.unit ? ` ${schema.unit}` : ""}`;
  }
  return schema.value_type ?? "任意值";
}

function renderControlInput(
  schema: DeviceControlSchemaItemDto,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return <p className="muted-copy">这个动作不需要输入取值，发送时会使用空值。</p>;
  }

  if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
    return (
      <select
        className="control-input"
        onChange={(event) => onChange(event.target.value)}
        value={String(value ?? "")}
      >
        {schema.allowed_values.map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    );
  }

  if (type.includes("BOOL") || schema.action_type.toUpperCase().includes("POWER")) {
    return (
      <label className="home-device-control-panel__switch">
        <input
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span>{Boolean(value) ? "开启" : "关闭"}</span>
      </label>
    );
  }

  if (schema.value_range || type.includes("NUMBER") || type.includes("INT") || type.includes("FLOAT")) {
    return (
      <input
        className="control-input"
        max={getRangeNumber(schema.value_range?.max)}
        min={getRangeNumber(schema.value_range?.min)}
        onChange={(event) => onChange(event.target.value)}
        step={getRangeNumber(schema.value_range?.step)}
        type="number"
        value={String(value ?? "")}
      />
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

export function HomeDeviceControlPanel({ hotspot, onClose }: HomeDeviceControlPanelProps) {
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
  const selectedSchemaValueType = selectedSchema?.value_type?.toUpperCase() ?? "NONE";
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
        await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 350 : 600));
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

  return (
    <section
      className={panelClass}
      style={{ left: `${hotspot.x * 100}%`, top: `${hotspot.y * 100}%` }}
    >
      <div className="home-device-control-panel__header">
        <div>
          <span>{device?.device_type ?? hotspot.deviceTypeLabel}</span>
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
        <span>{device?.runtime_state?.aggregated_state ?? hotspot.statusLabel}</span>
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
        <p className="muted-copy">当前设备没有可用控制项。</p>
      ) : null}

      {selectedSchema ? (
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
                  {schema.action_type} / {schema.target_key ?? schema.target_scope ?? "默认目标"}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>{`目标 ${selectedSchema.target_scope ?? "默认"} / ${
              selectedSchema.target_key ?? "默认"
            }`}</span>
            {renderControlInput(selectedSchema, selectedValue, (nextValue) => {
              setValues((current) => ({ ...current, [selectedKey]: nextValue }));
            })}
          </label>

          <div className="home-device-control-panel__meta">
            <span>{`取值 ${describeValue(selectedSchema)}`}</span>
            <span>{`类型 ${selectedSchemaValueType}`}</span>
            <span>{selectedSchema.is_quick_action ? "快捷动作" : "详情动作"}</span>
            {selectedSchema.requires_detail_entry ? <span>需要详情入口</span> : null}
          </div>

          <button
            className="button button--primary"
            disabled={submitting || queryingResult || device?.is_readonly_device}
            onClick={() => void submitControl()}
            type="button"
          >
            {queryingResult ? "查询结果中..." : submitting ? "发送中..." : accepted ? "重新发送" : "发送控制"}
          </button>
        </div>
      ) : null}

      {accepted ? (
        <div className="home-device-control-panel__result">
          <strong>{accepted.message}</strong>
          <span>{`请求 ${accepted.request_id}`}</span>
          <span>{`确认 ${accepted.confirmation_type} · 超时 ${accepted.timeout_seconds}s`}</span>
        </div>
      ) : null}

      {result ? (
        <div className={`home-device-control-panel__result is-${result.execution_status.toLowerCase()}`}>
          <strong>{formatResultStatus(result.execution_status)}</strong>
          {result.error_code ? <span>{`${result.error_code}: ${result.error_message ?? ""}`}</span> : null}
          {result.final_runtime_state ? (
            <span>{JSON.stringify(result.final_runtime_state)}</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
