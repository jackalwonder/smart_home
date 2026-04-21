import { useEffect, useMemo, useState } from "react";
import { fetchDeviceDetail } from "../../api/devicesApi";
import {
  DeviceControlSchemaItemDto,
  DeviceDetailDto,
  DeviceListItemDto,
} from "../../api/types";
import { HomeHotspotViewModel } from "../../view-models/home";
import { HotspotIcon } from "./HotspotIcon";
import {
  controlSchemaKey,
  formatDeviceControlError,
  formatPowerStateLabel,
  isPowerControlSchema,
  isRuntimePowerOn,
  normalizeControlKeyword,
  submitDeviceControl,
} from "./deviceControlHelpers";

type HotspotControlMode = "detail" | "group";

interface HomeHotspotControlModalProps {
  devices: DeviceListItemDto[];
  hotspot: HomeHotspotViewModel | null;
  mode: HotspotControlMode;
  onClose: () => void;
  open: boolean;
}

interface DeviceCandidate {
  deviceId: string;
  displayName: string;
  roomId: string | null;
  roomName: string | null;
  deviceType: string;
  status: string;
  isOffline: boolean;
  isReadonly: boolean;
  isComplex: boolean;
}

type HotspotGroupKind = "lighting" | "climate" | "cover" | "media" | "device";

function deviceKind(deviceType: string): HotspotGroupKind {
  const source = normalizeControlKeyword(deviceType);
  if (source.includes("light") || source.includes("lamp") || source.includes("switch")) {
    return "lighting";
  }
  if (source.includes("climate") || source.includes("air") || source.includes("fan")) {
    return "climate";
  }
  if (source.includes("cover") || source.includes("curtain") || source.includes("blind")) {
    return "cover";
  }
  if (source.includes("media") || source.includes("tv") || source.includes("speaker")) {
    return "media";
  }
  return "device";
}

function kindTitle(kind: HotspotGroupKind, mode: HotspotControlMode) {
  if (mode === "detail") {
    switch (kind) {
      case "lighting":
        return "灯光控制";
      case "climate":
        return "温控控制";
      case "cover":
        return "窗帘控制";
      case "media":
        return "媒体控制";
      default:
        return "设备控制";
    }
  }

  switch (kind) {
    case "lighting":
      return "常用灯光";
    case "climate":
      return "常用温控";
    case "cover":
      return "窗帘控制";
    case "media":
      return "媒体控制";
    default:
      return "同房间控制";
  }
}

function candidateFromDevice(device: DeviceListItemDto): DeviceCandidate {
  return {
    deviceId: device.device_id,
    displayName: device.display_name,
    roomId: device.room_id ?? null,
    roomName: device.room_name ?? null,
    deviceType: device.device_type,
    status: device.status,
    isOffline: device.is_offline,
    isReadonly: device.is_readonly_device,
    isComplex: device.is_complex_device,
  };
}

function candidateFromHotspot(hotspot: HomeHotspotViewModel): DeviceCandidate {
  return {
    deviceId: hotspot.deviceId,
    displayName: hotspot.label,
    roomId: null,
    roomName: null,
    deviceType: hotspot.deviceType,
    status: hotspot.status,
    isOffline: hotspot.isOffline,
    isReadonly: hotspot.isReadonly,
    isComplex: hotspot.isComplex,
  };
}

function sameRoom(device: DeviceCandidate, anchor: DeviceCandidate) {
  if (anchor.roomId) {
    return device.roomId === anchor.roomId;
  }
  if (anchor.roomName) {
    return device.roomName === anchor.roomName;
  }
  return false;
}

function detailState(detail: DeviceDetailDto | null, fallback: DeviceCandidate) {
  return detail?.runtime_state?.aggregated_state ?? detail?.status ?? fallback.status;
}

function rangeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isNumberControlSchema(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  return (
    Boolean(schema.value_range) ||
    type.includes("NUMBER") ||
    type.includes("INT") ||
    type.includes("FLOAT")
  );
}

function isTemperatureSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeControlKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("temperature") || source.includes("temp");
}

function isBrightnessSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeControlKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("brightness");
}

function isModeSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeControlKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("mode") || source.includes("preset");
}

function getInitialValue(schema: DeviceControlSchemaItemDto) {
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
    return schema.allowed_values[0];
  }
  if (isPowerControlSchema(schema)) {
    return true;
  }
  const min = rangeNumber(schema.value_range?.min);
  if (min !== undefined) {
    return min;
  }
  if (isNumberControlSchema(schema)) {
    return 0;
  }
  if (type === "NONE") {
    return null;
  }
  return "";
}

function optionLabel(value: unknown) {
  const normalized = normalizeControlKeyword(String(value));
  const map: Record<string, string> = {
    auto: "自动",
    cool: "制冷",
    heat: "制热",
    dry: "除湿",
    fan: "送风",
    manual: "手动",
    smart: "智能",
    holiday: "假日",
    away: "离家",
    eco: "节能",
    sleep: "睡眠",
    high: "高",
    medium: "中",
    mid: "中",
    low: "低",
    on: "开启",
    off: "关闭",
    true: "开启",
    false: "关闭",
  };
  return map[normalized] ?? String(value);
}

function schemaTitle(schema: DeviceControlSchemaItemDto) {
  const source = normalizeControlKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  if (isTemperatureSchema(schema)) {
    return "目标温度";
  }
  if (isBrightnessSchema(schema)) {
    return "亮度";
  }
  if (isModeSchema(schema)) {
    return "模式";
  }
  if (isPowerControlSchema(schema)) {
    return "电源开关";
  }
  if (source.includes("fan") || source.includes("speed")) {
    return "风速";
  }
  if (source.includes("position") || source.includes("cover")) {
    return "开合位置";
  }
  if ((schema.value_type?.toUpperCase() ?? "NONE") === "NONE") {
    return "执行动作";
  }
  return "控制项";
}

function resultMessage(status: string | undefined, nextValue?: unknown) {
  if (!status || status === "SUCCESS") {
    if (typeof nextValue === "boolean") {
      return nextValue ? "ON" : "OFF";
    }
    return "已应用";
  }
  return status;
}

export function HomeHotspotControlModal({
  devices,
  hotspot,
  mode,
  onClose,
  open,
}: HomeHotspotControlModalProps) {
  const [details, setDetails] = useState<DeviceDetailDto[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [optimisticPower, setOptimisticPower] = useState<Record<string, boolean>>({});

  const targetCandidates = useMemo(() => {
    if (!hotspot) {
      return [];
    }

    const anchor =
      devices.find((device) => device.device_id === hotspot.deviceId) ?? null;
    const anchorCandidate = anchor
      ? candidateFromDevice(anchor)
      : candidateFromHotspot(hotspot);

    if (mode === "detail") {
      return [anchorCandidate];
    }

    const groupKind = deviceKind(anchorCandidate.deviceType);
    const sameRoomSameKind = devices
      .map(candidateFromDevice)
      .filter(
        (device) =>
          sameRoom(device, anchorCandidate) &&
          deviceKind(device.deviceType) === groupKind,
      );

    const hasAnchor = sameRoomSameKind.some(
      (device) => device.deviceId === anchorCandidate.deviceId,
    );
    const candidates = sameRoomSameKind.length
      ? hasAnchor
        ? sameRoomSameKind
        : [anchorCandidate, ...sameRoomSameKind]
      : [anchorCandidate];

    return candidates.slice(0, 24);
  }, [devices, hotspot, mode]);

  const detailsById = useMemo(() => {
    return new Map(details.map((detail) => [detail.device_id, detail]));
  }, [details]);

  const primaryCandidate =
    targetCandidates[0] ?? (hotspot ? candidateFromHotspot(hotspot) : null);
  const primaryDetail = primaryCandidate
    ? detailsById.get(primaryCandidate.deviceId) ?? null
    : null;
  const anchorKind = primaryCandidate ? deviceKind(primaryCandidate.deviceType) : "device";
  const onlineCount = targetCandidates.filter((device) => !device.isOffline).length;
  const controllableCount =
    mode === "detail"
      ? primaryDetail?.control_schema.length ?? 0
      : targetCandidates.filter((device) => {
          const detail = detailsById.get(device.deviceId);
          return Boolean(detail?.control_schema.some(isPowerControlSchema));
        }).length;

  useEffect(() => {
    if (!open || !hotspot) {
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setDetails([]);
    setValues({});
    setMessages({});
    setPending({});
    setOptimisticPower({});

    void (async () => {
      const responses = await Promise.allSettled(
        targetCandidates.map((device) => fetchDeviceDetail(device.deviceId)),
      );
      if (!active) {
        return;
      }
      const loadedDetails = responses
        .filter(
          (entry): entry is PromiseFulfilledResult<DeviceDetailDto> =>
            entry.status === "fulfilled",
        )
        .map((entry) => entry.value);
      const initialValues: Record<string, unknown> = {};
      loadedDetails.forEach((detail) => {
        detail.control_schema.forEach((schema, index) => {
          initialValues[`${detail.device_id}:${controlSchemaKey(schema, index)}`] =
            getInitialValue(schema);
        });
      });
      setDetails(loadedDetails);
      setValues(initialValues);
      if (!loadedDetails.length && targetCandidates.length) {
        setError("设备控制能力读取失败");
      }
      setLoading(false);
    })().catch((nextError) => {
      if (!active) {
        return;
      }
      setError(formatDeviceControlError(nextError));
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [hotspot, mode, open, targetCandidates]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || !hotspot || !primaryCandidate) {
    return null;
  }
  const activeHotspot = hotspot;

  async function submitSchema(
    detail: DeviceDetailDto,
    schema: DeviceControlSchemaItemDto,
    schemaIndex: number,
    overrideValue?: unknown,
  ) {
    const key = `${detail.device_id}:${controlSchemaKey(schema, schemaIndex)}`;
    const nextValue = overrideValue ?? values[key] ?? getInitialValue(schema);

    setPending((current) => ({ ...current, [key]: true }));
    setMessages((current) => ({ ...current, [key]: "发送中" }));

    try {
      const result = await submitDeviceControl({
        deviceId: detail.device_id,
        schema,
        value: nextValue,
        requestPrefix: "hotspot",
      });
      setMessages((current) => ({
        ...current,
        [key]: resultMessage(result?.execution_status, nextValue),
      }));
    } catch (nextError) {
      setMessages((current) => ({
        ...current,
        [key]: formatDeviceControlError(nextError),
      }));
    } finally {
      setPending((current) => ({ ...current, [key]: false }));
    }
  }

  async function toggleDevice(candidate: DeviceCandidate, detail: DeviceDetailDto) {
    const powerIndex = detail.control_schema.findIndex(isPowerControlSchema);
    const powerSchema = detail.control_schema[powerIndex];
    if (!powerSchema) {
      return;
    }

    const currentState =
      candidate.deviceId in optimisticPower
        ? optimisticPower[candidate.deviceId]
        : detailState(detail, candidate);
    const nextValue = !isRuntimePowerOn(
      currentState,
      detail.is_offline || candidate.isOffline,
    );
    const pendingKey = `${detail.device_id}:${controlSchemaKey(powerSchema, powerIndex)}`;

    setPending((current) => ({ ...current, [pendingKey]: true }));
    setMessages((current) => ({ ...current, [candidate.deviceId]: "发送中" }));
    setOptimisticPower((current) => ({
      ...current,
      [candidate.deviceId]: nextValue,
    }));

    try {
      const result = await submitDeviceControl({
        deviceId: detail.device_id,
        schema: powerSchema,
        value: nextValue,
        requestPrefix: "hotspot",
      });
      if (!result || result.execution_status === "SUCCESS") {
        setMessages((current) => ({
          ...current,
          [candidate.deviceId]: nextValue ? "ON" : "OFF",
        }));
        return;
      }

      setOptimisticPower((current) => {
        const next = { ...current };
        delete next[candidate.deviceId];
        return next;
      });
      setMessages((current) => ({
        ...current,
        [candidate.deviceId]: result.error_message ?? result.execution_status,
      }));
    } catch (nextError) {
      setOptimisticPower((current) => {
        const next = { ...current };
        delete next[candidate.deviceId];
        return next;
      });
      setMessages((current) => ({
        ...current,
        [candidate.deviceId]: formatDeviceControlError(nextError),
      }));
    } finally {
      setPending((current) => ({ ...current, [pendingKey]: false }));
    }
  }

  function renderDetailControl(
    detail: DeviceDetailDto,
    schema: DeviceControlSchemaItemDto,
    index: number,
  ) {
    const key = `${detail.device_id}:${controlSchemaKey(schema, index)}`;
    const value = values[key] ?? getInitialValue(schema);
    const schemaType = schema.value_type?.toUpperCase() ?? "NONE";
    const disabled = detail.is_offline || detail.is_readonly_device || Boolean(pending[key]);
    const message = messages[key];

    if (isPowerControlSchema(schema)) {
      return (
        <article className="home-hotspot-control-modal__detail-control" key={key}>
          <span>{schemaTitle(schema)}</span>
          <div className="home-hotspot-control-modal__detail-segmented">
            <button
              className={value === true ? "is-active" : ""}
              disabled={disabled}
              onClick={() => {
                setValues((current) => ({ ...current, [key]: true }));
                void submitSchema(detail, schema, index, true);
              }}
              type="button"
            >
              开启
            </button>
            <button
              className={value === false ? "is-active" : ""}
              disabled={disabled}
              onClick={() => {
                setValues((current) => ({ ...current, [key]: false }));
                void submitSchema(detail, schema, index, false);
              }}
              type="button"
            >
              关闭
            </button>
          </div>
          {message ? <em>{message}</em> : null}
        </article>
      );
    }

    if (isNumberControlSchema(schema)) {
      const min = rangeNumber(schema.value_range?.min) ?? 0;
      const max = rangeNumber(schema.value_range?.max) ?? 100;
      const step = rangeNumber(schema.value_range?.step) ?? 1;
      const numericValue = Number(value ?? min);
      return (
        <article className="home-hotspot-control-modal__detail-control is-range" key={key}>
          <span>{schemaTitle(schema)}</span>
          <div className="home-hotspot-control-modal__detail-stepper">
            <button
              disabled={disabled}
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  [key]: Math.max(min, numericValue - step),
                }))
              }
              type="button"
            >
              -
            </button>
            <strong>
              {Number.isFinite(numericValue) ? numericValue : min}
              {schema.unit ? ` ${schema.unit}` : ""}
            </strong>
            <button
              disabled={disabled}
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  [key]: Math.min(max, numericValue + step),
                }))
              }
              type="button"
            >
              +
            </button>
          </div>
          <input
            disabled={disabled}
            max={max}
            min={min}
            onChange={(event) =>
              setValues((current) => ({ ...current, [key]: Number(event.target.value) }))
            }
            step={step}
            type="range"
            value={Number.isFinite(numericValue) ? numericValue : min}
          />
          <button
            className="home-hotspot-control-modal__detail-apply"
            disabled={disabled}
            onClick={() => void submitSchema(detail, schema, index)}
            type="button"
          >
            应用
          </button>
          {message ? <em>{message}</em> : null}
        </article>
      );
    }

    if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
      return (
        <article className="home-hotspot-control-modal__detail-control" key={key}>
          <span>{schemaTitle(schema)}</span>
          <div className="home-hotspot-control-modal__detail-chips">
            {schema.allowed_values.map((option) => (
              <button
                className={value === option ? "is-active" : ""}
                disabled={disabled}
                key={String(option)}
                onClick={() => {
                  setValues((current) => ({ ...current, [key]: option }));
                  void submitSchema(detail, schema, index, option);
                }}
                type="button"
              >
                {optionLabel(option)}
              </button>
            ))}
          </div>
          {message ? <em>{message}</em> : null}
        </article>
      );
    }

    if (schemaType === "NONE") {
      return (
        <article className="home-hotspot-control-modal__detail-control" key={key}>
          <span>{schemaTitle(schema)}</span>
          <button
            className="home-hotspot-control-modal__detail-apply"
            disabled={disabled}
            onClick={() => void submitSchema(detail, schema, index, null)}
            type="button"
          >
            执行
          </button>
          {message ? <em>{message}</em> : null}
        </article>
      );
    }

    return (
      <article className="home-hotspot-control-modal__detail-control" key={key}>
        <span>{schemaTitle(schema)}</span>
        <input
          className="control-input"
          disabled={disabled}
          onChange={(event) =>
            setValues((current) => ({ ...current, [key]: event.target.value }))
          }
          value={String(value ?? "")}
        />
        <button
          className="home-hotspot-control-modal__detail-apply"
          disabled={disabled}
          onClick={() => void submitSchema(detail, schema, index)}
          type="button"
        >
          应用
        </button>
        {message ? <em>{message}</em> : null}
      </article>
    );
  }

  function renderDetailMode() {
    const stateValue = detailState(primaryDetail, primaryCandidate);
    const offline = primaryDetail?.is_offline ?? primaryCandidate.isOffline;
    const readonly = primaryDetail?.is_readonly_device ?? primaryCandidate.isReadonly;
    const stateLabel = formatPowerStateLabel(stateValue, offline);
    const schemas = primaryDetail?.control_schema ?? [];

    return (
      <div className="home-hotspot-control-modal__detail">
        <article className="home-hotspot-control-modal__detail-card">
          <div className="home-hotspot-control-modal__detail-card-head">
            <span className="home-hotspot-control-modal__tile-icon" aria-hidden="true">
              <HotspotIcon
                deviceType={activeHotspot.deviceType}
                iconAssetUrl={activeHotspot.iconAssetUrl}
                iconType={activeHotspot.iconType}
                isOffline={offline}
                status={stateValue}
              />
            </span>
            <div>
              <strong>{primaryDetail?.display_name ?? primaryCandidate.displayName}</strong>
              <small>{primaryDetail?.room_name ?? primaryCandidate.roomName ?? "未分配房间"}</small>
            </div>
            <em>{stateLabel}</em>
          </div>

          <div className="home-hotspot-control-modal__detail-status">
            <span>{offline ? "离线" : "在线"}</span>
            <span>{readonly ? "只读" : "可直接控制"}</span>
            <span>{loading ? "读取中" : `${schemas.length} 个控制项`}</span>
          </div>

          {loading ? <p className="muted-copy">正在读取设备控制能力</p> : null}
          {!loading && !schemas.length ? (
            <p className="home-hotspot-control-modal__device-note">
              当前设备暂时没有可用控制项。
            </p>
          ) : null}
          {schemas.map((schema, index) =>
            primaryDetail ? renderDetailControl(primaryDetail, schema, index) : null,
          )}
        </article>
      </div>
    );
  }

  function renderGroupMode() {
    return (
      <div className="home-cluster-modal__grid home-hotspot-control-modal__grid">
        {targetCandidates.map((candidate) => {
          const detail = detailsById.get(candidate.deviceId) ?? null;
          const powerIndex = detail?.control_schema.findIndex(isPowerControlSchema) ?? -1;
          const powerSchema =
            detail && powerIndex >= 0 ? detail.control_schema[powerIndex] : null;
          const stateValue =
            candidate.deviceId in optimisticPower
              ? optimisticPower[candidate.deviceId]
              : detailState(detail, candidate);
          const offline = detail?.is_offline ?? candidate.isOffline;
          const readonly = detail?.is_readonly_device ?? candidate.isReadonly;
          const active = isRuntimePowerOn(stateValue, offline);
          const pendingKey =
            detail && powerSchema && powerIndex >= 0
              ? `${detail.device_id}:${controlSchemaKey(powerSchema, powerIndex)}`
              : "";
          const disabled =
            loading ||
            offline ||
            readonly ||
            !detail ||
            !powerSchema ||
            Boolean(pending[pendingKey]);
          const message = messages[candidate.deviceId];

          return (
            <button
              aria-label={`${candidate.displayName} ${active ? "关闭" : "开启"}`}
              className={[
                "home-hotspot-control-modal__tile",
                active ? "is-active" : "",
                offline ? "is-offline" : "",
                disabled ? "is-disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={disabled}
              key={candidate.deviceId}
              onClick={() => {
                if (detail) {
                  void toggleDevice(candidate, detail);
                }
              }}
              type="button"
            >
              <span className="home-hotspot-control-modal__tile-icon" aria-hidden="true">
                <HotspotIcon
                  deviceType={candidate.deviceType}
                  iconAssetUrl={
                    candidate.deviceId === activeHotspot.deviceId
                      ? activeHotspot.iconAssetUrl
                      : null
                  }
                  iconType={
                    candidate.deviceId === activeHotspot.deviceId
                      ? activeHotspot.iconType
                      : candidate.deviceType
                  }
                  isOffline={offline}
                  status={String(stateValue ?? "")}
                />
              </span>
              <span className="home-hotspot-control-modal__tile-copy">
                <strong>{detail?.display_name ?? candidate.displayName}</strong>
                <small>{detail?.room_name ?? candidate.roomName ?? "未分配房间"}</small>
              </span>
              <em>{message ?? formatPowerStateLabel(stateValue, offline)}</em>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      aria-modal="true"
      className={[
        "home-cluster-modal",
        "home-hotspot-control-modal",
        mode === "detail" ? "is-detail" : "is-group",
      ].join(" ")}
      role="dialog"
    >
      <div
        aria-hidden="true"
        className="home-cluster-modal__backdrop"
        onClick={onClose}
      />
      <section
        className={[
          "home-cluster-modal__panel",
          "home-hotspot-control-modal__panel",
          `is-${anchorKind}`,
          mode === "detail" ? "is-detail" : "is-group",
        ].join(" ")}
      >
        <header className="home-cluster-modal__header home-hotspot-control-modal__header">
          <div className="home-cluster-modal__title-row">
            <span className="home-cluster-modal__glyph" aria-hidden="true">
              <HotspotIcon
                deviceType={activeHotspot.deviceType}
                iconAssetUrl={activeHotspot.iconAssetUrl}
                iconType={activeHotspot.iconType}
                isOffline={activeHotspot.isOffline}
                status={activeHotspot.status}
              />
            </span>
            <div>
              <span className="card-eyebrow">
                {mode === "detail" ? "设备详情" : "同房间控制"}
              </span>
              <h3>{kindTitle(anchorKind, mode)}</h3>
              <p>
                {mode === "detail"
                  ? primaryDetail?.display_name ?? primaryCandidate.displayName
                  : primaryCandidate.roomName ?? activeHotspot.deviceTypeLabel}
              </p>
            </div>
          </div>
          <div className="home-cluster-modal__header-meta">
            <span>{mode === "detail" ? "1 设备" : `${targetCandidates.length} 设备`}</span>
            <span>{mode === "detail" ? (primaryCandidate.isOffline ? "离线" : "在线") : `${onlineCount} 在线`}</span>
            <span>{loading ? "读取中" : `${controllableCount} 可控`}</span>
          </div>
          <button
            aria-label="关闭弹窗"
            className="home-cluster-modal__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {error ? <p className="inline-error">{error}</p> : null}
        {mode === "detail" ? renderDetailMode() : renderGroupMode()}
      </section>
    </div>
  );
}
