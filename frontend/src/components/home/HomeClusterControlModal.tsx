import { useEffect, useMemo, useState } from "react";
import {
  acceptDeviceControl,
  fetchDeviceControlResult,
} from "../../api/deviceControlsApi";
import { fetchDeviceDetail } from "../../api/devicesApi";
import { normalizeApiError } from "../../api/httpClient";
import {
  DeviceControlSchemaItemDto,
  DeviceDetailDto,
  DeviceListItemDto,
} from "../../api/types";

export type HomeClusterKey = "lights" | "climate" | "battery" | "offline";

interface HomeClusterControlModalProps {
  open: boolean;
  cluster: HomeClusterKey | null;
  devices: DeviceListItemDto[];
  onClose: () => void;
}

function normalizeKeyword(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function schemaId(schema: DeviceControlSchemaItemDto, index: number) {
  return `${schema.action_type}:${schema.target_scope ?? ""}:${schema.target_key ?? ""}:${index}`;
}

function makeRequestId(deviceId: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `cluster-${deviceId}-${suffix}`;
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

function getInitialValue(schema: DeviceControlSchemaItemDto) {
  const type = (schema.value_type ?? "NONE").toUpperCase();
  if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
    return schema.allowed_values[0];
  }
  if (type.includes("BOOL") || normalizeKeyword(schema.action_type).includes("power")) {
    return true;
  }
  const min = rangeNumber(schema.value_range?.min);
  if (min !== undefined) {
    return min;
  }
  if (type === "NONE") {
    return null;
  }
  return "";
}

function isPowerSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("power") || source.includes("toggle");
}

function isTemperatureSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("temperature") || source.includes("temp");
}

function isBrightnessSchema(schema: DeviceControlSchemaItemDto) {
  const source = normalizeKeyword(
    `${schema.action_type} ${schema.target_scope ?? ""} ${schema.target_key ?? ""}`,
  );
  return source.includes("brightness");
}

function isModeSchema(schema: DeviceControlSchemaItemDto) {
  return normalizeKeyword(schema.action_type).includes("mode");
}

function formatRuntimeState(detail: DeviceDetailDto | DeviceListItemDto) {
  const value =
    "runtime_state" in detail
      ? detail.runtime_state?.aggregated_state ?? detail.status
      : detail.status;
  const normalized = normalizeKeyword(typeof value === "string" ? value : "");
  if (detail.is_offline) {
    return "离线";
  }
  if (normalized.includes("on") || normalized.includes("open")) {
    return "已开启";
  }
  if (normalized.includes("running")) {
    return "运行中";
  }
  if (normalized.includes("off") || normalized.includes("closed")) {
    return "已关闭";
  }
  return typeof value === "string" && value.trim() ? value : "状态待更新";
}

function formatControlError(error: unknown) {
  const apiError = normalizeApiError(error);
  switch (apiError.code) {
    case "NETWORK_ERROR":
      return "控制请求没有成功到达服务端，请检查连接后重试。";
    case "UNAUTHORIZED":
      return "当前登录状态已失效，请刷新页面后再试。";
    case "INVALID_PARAMS":
      return "控制参数不符合设备要求，请调整后重试。";
    default:
      return apiError.message;
  }
}

function modalTitle(cluster: HomeClusterKey | null) {
  switch (cluster) {
    case "lights":
      return "全屋灯光";
    case "climate":
      return "常用温控";
    case "battery":
      return "低电量设备";
    case "offline":
      return "离线设备";
    default:
      return "全屋控制";
  }
}

function modalSubtitle(cluster: HomeClusterKey | null) {
  switch (cluster) {
    case "lights":
      return "常开的灯光可以在这里直接开关或调亮度。";
    case "climate":
      return "常用温控集中在这里，便于现场快速调节。";
    case "battery":
      return "优先排查需要更换电池的设备。";
    case "offline":
      return "检查离线设备的供电、网络与 HA 实体状态。";
    default:
      return "";
  }
}

export function HomeClusterControlModal({
  open,
  cluster,
  devices,
  onClose,
}: HomeClusterControlModalProps) {
  const [details, setDetails] = useState<DeviceDetailDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const filteredDevices = useMemo(() => {
    switch (cluster) {
      case "lights":
        return devices.filter((device) => {
          const source = normalizeKeyword(device.device_type);
          return source.includes("light") || source.includes("lamp") || source.includes("switch");
        });
      case "climate":
        return devices.filter((device) => {
          const source = normalizeKeyword(device.device_type);
          return source.includes("climate") || source.includes("air") || source.includes("fridge");
        });
      case "battery":
        return devices.filter((device) => (device.alert_badges ?? []).length > 0);
      case "offline":
        return devices.filter((device) => device.is_offline);
      default:
        return [];
    }
  }, [cluster, devices]);

  useEffect(() => {
    if (!open || !cluster) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    setMessages({});
    setPending({});

    void (async () => {
      try {
        const targetDevices =
          cluster === "battery" || cluster === "offline"
            ? filteredDevices
            : filteredDevices.slice(0, 8);
        const responses = await Promise.allSettled(
          targetDevices.map((device) => fetchDeviceDetail(device.device_id)),
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
            initialValues[`${detail.device_id}:${schemaId(schema, index)}`] =
              getInitialValue(schema);
          });
        });
        setDetails(loadedDetails);
        setValues(initialValues);
      } catch (nextError) {
        if (active) {
          setError(formatControlError(nextError));
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
  }, [cluster, filteredDevices, open]);

  if (!open || !cluster) {
    return null;
  }

  async function submitControl(
    detail: DeviceDetailDto,
    schema: DeviceControlSchemaItemDto,
    schemaIndex: number,
    overrideValue?: unknown,
  ) {
    const key = `${detail.device_id}:${schemaId(schema, schemaIndex)}`;
    const nextValue = overrideValue ?? values[key];
    setPending((current) => ({ ...current, [key]: true }));
    setMessages((current) => ({ ...current, [detail.device_id]: "正在发送控制…" }));

    try {
      const accepted = await acceptDeviceControl({
        request_id: makeRequestId(detail.device_id),
        device_id: detail.device_id,
        action_type: schema.action_type,
        payload: {
          target_scope: schema.target_scope,
          target_key: schema.target_key,
          value: nextValue,
          unit: schema.unit,
        },
        client_ts: new Date().toISOString(),
      });
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      const result = await fetchDeviceControlResult(accepted.request_id);
      setMessages((current) => ({
        ...current,
        [detail.device_id]:
          result.execution_status === "SUCCESS"
            ? "设备已完成控制"
            : result.error_message ?? "设备尚未返回成功确认",
      }));
    } catch (nextError) {
      setMessages((current) => ({
        ...current,
        [detail.device_id]: formatControlError(nextError),
      }));
    } finally {
      setPending((current) => ({ ...current, [key]: false }));
    }
  }

  return (
    <div className="home-cluster-modal" role="dialog" aria-modal="true">
      <div className="home-cluster-modal__backdrop" onClick={onClose} aria-hidden="true" />
      <section className="home-cluster-modal__panel">
        <header className="home-cluster-modal__header">
          <div>
            <span className="card-eyebrow">{modalTitle(cluster)}</span>
            <h3>{modalTitle(cluster)}</h3>
            <p>{modalSubtitle(cluster)}</p>
          </div>
          <button
            aria-label="关闭弹层"
            className="home-cluster-modal__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {error ? <p className="inline-error">{error}</p> : null}
        {loading ? <p className="muted-copy">正在读取设备控制能力…</p> : null}
        {!loading && !filteredDevices.length ? (
          <div className="home-cluster-modal__empty">
            <strong>当前没有匹配设备</strong>
            <p>等你把更多设备接入或加入首页后，这里会更像一套完整中控。</p>
          </div>
        ) : null}

        <div className="home-cluster-modal__grid">
          {(details.length ? details : filteredDevices).map((item) => {
            const detail = "control_schema" in item ? item : null;
            const deviceId = detail?.device_id ?? item.device_id;
            const powerSchema = detail?.control_schema.find(isPowerSchema);
            const powerIndex = detail?.control_schema.findIndex(isPowerSchema) ?? -1;
            const rangeSchema =
              cluster === "lights"
                ? detail?.control_schema.find(isBrightnessSchema)
                : detail?.control_schema.find(isTemperatureSchema);
            const rangeIndex =
              cluster === "lights"
                ? detail?.control_schema.findIndex(isBrightnessSchema) ?? -1
                : detail?.control_schema.findIndex(isTemperatureSchema) ?? -1;
            const modeSchema =
              cluster === "climate" ? detail?.control_schema.find(isModeSchema) : undefined;
            const modeIndex =
              cluster === "climate"
                ? detail?.control_schema.findIndex(isModeSchema) ?? -1
                : -1;
            const rangeKey =
              detail && rangeSchema && rangeIndex >= 0
                ? `${detail.device_id}:${schemaId(rangeSchema, rangeIndex)}`
                : "";
            const modeKey =
              detail && modeSchema && modeIndex >= 0
                ? `${detail.device_id}:${schemaId(modeSchema, modeIndex)}`
                : "";

            return (
              <article key={deviceId} className="home-cluster-modal__device-card">
                <div className="home-cluster-modal__device-topline">
                  <span>{detail?.room_name ?? item.room_name ?? "未分配房间"}</span>
                  <em>{formatRuntimeState(detail ?? item)}</em>
                </div>
                <strong>{detail?.display_name ?? item.display_name}</strong>

                {(cluster === "offline" || cluster === "battery") && !detail ? (
                  <p className="home-cluster-modal__device-note">
                    {(item.alert_badges ?? []).map((badge) => badge.text).join("，") || "待进一步检查"}
                  </p>
                ) : null}

                {powerSchema && detail ? (
                  <div className="home-cluster-modal__device-actions">
                    <button
                      disabled={Boolean(
                        pending[`${detail.device_id}:${schemaId(powerSchema, powerIndex)}`],
                      )}
                      onClick={() => void submitControl(detail, powerSchema, powerIndex, true)}
                      type="button"
                    >
                      开启
                    </button>
                    <button
                      disabled={Boolean(
                        pending[`${detail.device_id}:${schemaId(powerSchema, powerIndex)}`],
                      )}
                      onClick={() => void submitControl(detail, powerSchema, powerIndex, false)}
                      type="button"
                    >
                      关闭
                    </button>
                  </div>
                ) : null}

                {rangeSchema && detail && rangeKey ? (
                  <div className="home-cluster-modal__device-range">
                    <label>
                      <span>{cluster === "lights" ? "亮度" : "目标温度"}</span>
                      <div className="home-cluster-modal__stepper">
                        <button
                          onClick={() =>
                            setValues((current) => {
                              const currentValue = rangeNumber(current[rangeKey]) ?? 0;
                              const step = rangeNumber(rangeSchema.value_range?.step) ?? 1;
                              return { ...current, [rangeKey]: currentValue - step };
                            })
                          }
                          type="button"
                        >
                          −
                        </button>
                        <strong>
                          {String(values[rangeKey] ?? getInitialValue(rangeSchema))}
                          {rangeSchema.unit ? ` ${rangeSchema.unit}` : ""}
                        </strong>
                        <button
                          onClick={() =>
                            setValues((current) => {
                              const currentValue = rangeNumber(current[rangeKey]) ?? 0;
                              const step = rangeNumber(rangeSchema.value_range?.step) ?? 1;
                              return { ...current, [rangeKey]: currentValue + step };
                            })
                          }
                          type="button"
                        >
                          +
                        </button>
                      </div>
                    </label>
                    <input
                      max={rangeNumber(rangeSchema.value_range?.max)}
                      min={rangeNumber(rangeSchema.value_range?.min)}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [rangeKey]: Number(event.target.value),
                        }))
                      }
                      step={rangeNumber(rangeSchema.value_range?.step) ?? 1}
                      type="range"
                      value={Number(values[rangeKey] ?? getInitialValue(rangeSchema))}
                    />
                    <button
                      className="home-cluster-modal__apply"
                      disabled={Boolean(pending[rangeKey])}
                      onClick={() => void submitControl(detail, rangeSchema, rangeIndex)}
                      type="button"
                    >
                      应用
                    </button>
                  </div>
                ) : null}

                {modeSchema && detail && modeKey && Array.isArray(modeSchema.allowed_values) ? (
                  <div className="home-cluster-modal__device-modes">
                    {modeSchema.allowed_values.slice(0, 4).map((option) => (
                      <button
                        key={String(option)}
                        className={
                          values[modeKey] === option ? "is-active" : ""
                        }
                        onClick={() => {
                          setValues((current) => ({ ...current, [modeKey]: option }));
                          void submitControl(detail, modeSchema, modeIndex, option);
                        }}
                        type="button"
                      >
                        {String(option)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {!powerSchema && !rangeSchema && !modeSchema ? (
                  <p className="home-cluster-modal__device-note">
                    当前没有可直接控制的项目，可进入设备详情继续操作。
                  </p>
                ) : null}

                {messages[deviceId] ? (
                  <p className="home-cluster-modal__feedback">{messages[deviceId]}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
