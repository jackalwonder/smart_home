import { useEffect, useMemo, useState } from "react";
import {
  acceptDeviceControl,
  fetchDeviceControlResult,
} from "../../api/deviceControlsApi";
import { fetchDeviceDetail } from "../../api/devicesApi";
import {
  DeviceControlAcceptedDto,
  DeviceControlResultDto,
  DeviceDetailDto,
} from "../../api/types";
import { HomeHotspotViewModel } from "../../view-models/home";
import { HomeDeviceControlInput } from "./HomeDeviceControlInput";
import {
  describeAction,
  describeResult,
  formatControlError,
  formatStatus,
  getInitialValue,
  isBooleanSchema,
  makeRequestId,
  normalizeControlValue,
  schemaKey,
  toneLabel,
} from "./homeDeviceControlModel";

interface HomeDeviceControlPanelProps {
  hotspot: HomeHotspotViewModel;
  onClose: () => void;
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
            <HomeDeviceControlInput
              schema={selectedSchema}
              value={selectedValue}
              onChange={(nextValue) => {
                setValues((current) => ({
                  ...current,
                  [selectedKey]: nextValue,
                }));
              }}
            />
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
