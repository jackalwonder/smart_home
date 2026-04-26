import { useMemo, useState } from "react";
import { HomeHotspotViewModel } from "../../view-models/home";
import { HomeDeviceControlInput } from "./HomeDeviceControlInput";
import {
  describeAction,
  describeResult,
  formatStatus,
  isBooleanSchema,
  schemaKey,
  toneLabel,
} from "./homeDeviceControlModel";
import { useDeviceControlFlow } from "./useDeviceControlFlow";

interface HomeDeviceControlPanelProps {
  hotspot: HomeHotspotViewModel;
  onClose: () => void;
}

export function HomeDeviceControlPanel({ hotspot, onClose }: HomeDeviceControlPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const control = useDeviceControlFlow({
    deviceIds: [hotspot.deviceId],
    enabled: Boolean(hotspot.deviceId),
    requestPrefix: "hotspot",
  });
  const device = control.details[0] ?? null;

  const schemas = device?.control_schema ?? [];
  const selectedSchema = schemas[selectedIndex] ?? null;
  const selectedKey =
    device && selectedSchema
      ? control.controlKey(device.device_id, selectedSchema, selectedIndex)
      : "";
  const selectedValue = selectedKey ? control.values[selectedKey] : undefined;
  const selectedAction = selectedSchema ? describeAction(selectedSchema) : null;
  const powerSchemaIndex = schemas.findIndex(isBooleanSchema);
  const isSimpleQuickPanel =
    schemas.length <= 2 && powerSchemaIndex >= 0 && !hotspot.isComplex;
  const accepted = device ? control.acceptedByDeviceId[device.device_id] : null;
  const result = device ? control.resultByDeviceId[device.device_id] : null;
  const submitting = Object.values(control.pendingByKey).some(Boolean);
  const queryingResult = Boolean(accepted && !result && submitting);
  const panelClass = useMemo(
    () =>
      [
        "home-device-control-panel",
        hotspot.x > 0.62 ? "is-left" : "is-right",
        hotspot.y > 0.42 ? "is-top" : "is-bottom",
      ].join(" "),
    [hotspot.x, hotspot.y],
  );

  function submitSelectedControl(
    schema = selectedSchema,
    overrideValue?: unknown,
    index = selectedIndex,
  ) {
    if (!device || !schema) {
      return;
    }
    void control.submitControl({
      detail: device,
      overrideValue,
      schema,
      schemaIndex: index,
    });
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
            className={["home-device-control-panel__glyph", toneLabel(hotspot.tone)].join(" ")}
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

      {control.loading ? <p className="muted-copy">正在读取设备控制能力…</p> : null}
      {control.error ? <p className="inline-error">{control.error}</p> : null}

      {!control.loading && isSimpleQuickPanel && quickSchema ? (
        <div className="home-device-control-panel__quick">
          <strong>快速控制</strong>
          <p>这个设备适合直接在热点旁完成开关操作。</p>
          <div className="home-device-control-panel__segmented">
            <button
              aria-label="开启"
              disabled={submitting || queryingResult || Boolean(device?.is_readonly_device)}
              onClick={() => submitSelectedControl(quickSchema, true, powerSchemaIndex)}
              type="button"
            >
              开启
            </button>
            <button
              aria-label="关闭"
              disabled={submitting || queryingResult || Boolean(device?.is_readonly_device)}
              onClick={() => submitSelectedControl(quickSchema, false, powerSchemaIndex)}
              type="button"
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {!control.loading && !isSimpleQuickPanel && selectedSchema && selectedAction ? (
        <div className="home-device-control-panel__form">
          <label className="form-field">
            <span>控制项目</span>
            <select
              aria-label="控制项"
              className="control-input"
              onChange={(event) => {
                setSelectedIndex(Number(event.target.value));
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
                control.setValue(selectedKey, nextValue);
              }}
            />
          </label>

          <button
            className="button button--primary"
            disabled={submitting || queryingResult || Boolean(device?.is_readonly_device)}
            onClick={() => submitSelectedControl()}
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

      {!control.loading && !schemas.length ? (
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
