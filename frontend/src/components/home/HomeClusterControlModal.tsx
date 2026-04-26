import { useMemo } from "react";
import {
  HomeClusterDevice,
  HomeClusterKey,
  clusterEyebrow,
  clusterIcon,
  feedbackTone,
  filterClusterDevices,
  formatOptionLabel,
  formatRuntimeState,
  getInitialValue,
  isBrightnessSchema,
  isModeSchema,
  isPowerSchema,
  isTemperatureSchema,
  modalSubtitle,
  modalTitle,
  rangeNumber,
} from "./homeClusterControlModel";
import { useDeviceControlFlow } from "./useDeviceControlFlow";

export type { HomeClusterKey } from "./homeClusterControlModel";

interface HomeClusterControlModalProps {
  open: boolean;
  cluster: HomeClusterKey | null;
  devices: HomeClusterDevice[];
  onClose: () => void;
}

export function HomeClusterControlModal({
  open,
  cluster,
  devices,
  onClose,
}: HomeClusterControlModalProps) {
  const filteredDevices = useMemo(() => {
    return filterClusterDevices(cluster, devices);
  }, [cluster, devices]);
  const controlTargetDevices =
    cluster === "battery" || cluster === "offline"
      ? filteredDevices
      : filteredDevices.slice(0, 8);
  const control = useDeviceControlFlow({
    deviceIds: controlTargetDevices.map((device) => device.device_id),
    enabled: open && Boolean(cluster),
    requestPrefix: "cluster",
  });

  if (!open || !cluster) {
    return null;
  }

  const onlineCount = filteredDevices.filter((device) => !device.is_offline).length;
  const controllableCount = control.details.filter(
    (detail) =>
      detail.control_schema.some(isPowerSchema) ||
      detail.control_schema.some(isTemperatureSchema) ||
      detail.control_schema.some(isBrightnessSchema),
  ).length;
  const compactPanel = filteredDevices.length <= 2;

  return (
    <div className="home-cluster-modal" role="dialog" aria-modal="true">
      <div className="home-cluster-modal__backdrop" onClick={onClose} aria-hidden="true" />
      <section
        className={`home-cluster-modal__panel is-${cluster}${compactPanel ? " is-compact" : ""}`}
      >
        <header className="home-cluster-modal__header">
          <div className="home-cluster-modal__title-row">
            <span className="home-cluster-modal__glyph" aria-hidden="true">
              {clusterIcon(cluster)}
            </span>
            <div>
              <span className="card-eyebrow">{clusterEyebrow(cluster)}</span>
              <h3>{modalTitle(cluster)}</h3>
              <p>{modalSubtitle(cluster)}</p>
            </div>
          </div>
          <div className="home-cluster-modal__header-meta">
            <span>{filteredDevices.length} 个设备</span>
            <span>{onlineCount} 个在线</span>
            {cluster === "lights" || cluster === "climate" ? (
              <span>{control.loading ? "读取中" : `${controllableCount} 个可控`}</span>
            ) : null}
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

        {control.error ? <p className="inline-error">{control.error}</p> : null}
        {control.loading ? <p className="muted-copy">正在读取设备控制能力…</p> : null}
        {!control.loading && !filteredDevices.length ? (
          <div className="home-cluster-modal__empty">
            <strong>当前没有匹配设备</strong>
            <p>等你把更多设备接入或加入首页后，这里会更像一套完整中控。</p>
          </div>
        ) : null}

        <div className="home-cluster-modal__grid">
          {(control.details.length ? control.details : filteredDevices).map((item) => {
            const detail = "control_schema" in item ? item : null;
            const deviceId = detail?.device_id ?? item.device_id;
            const stateLabel = formatRuntimeState(detail ?? item);
            const powerSchema = detail?.control_schema.find(isPowerSchema);
            const powerIndex = detail?.control_schema.findIndex(isPowerSchema) ?? -1;
            const rangeSchema =
              cluster === "lights"
                ? detail?.control_schema.find(isBrightnessSchema)
                : detail?.control_schema.find(isTemperatureSchema);
            const rangeIndex =
              cluster === "lights"
                ? (detail?.control_schema.findIndex(isBrightnessSchema) ?? -1)
                : (detail?.control_schema.findIndex(isTemperatureSchema) ?? -1);
            const modeSchema =
              cluster === "climate" ? detail?.control_schema.find(isModeSchema) : undefined;
            const modeIndex =
              cluster === "climate"
                ? (detail?.control_schema.findIndex(isModeSchema) ?? -1)
                : -1;
            const powerKey =
              detail && powerSchema && powerIndex >= 0
                ? control.controlKey(detail.device_id, powerSchema, powerIndex)
                : "";
            const rangeKey =
              detail && rangeSchema && rangeIndex >= 0
                ? control.controlKey(detail.device_id, rangeSchema, rangeIndex)
                : "";
            const modeKey =
              detail && modeSchema && modeIndex >= 0
                ? control.controlKey(detail.device_id, modeSchema, modeIndex)
                : "";

            return (
              <article
                key={deviceId}
                className={[
                  "home-cluster-modal__device-card",
                  item.is_offline || detail?.is_offline ? "is-offline" : "",
                  stateLabel === "已开启" || stateLabel === "运行中" ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="home-cluster-modal__device-topline">
                  <span className="home-cluster-modal__device-icon" aria-hidden="true">
                    {clusterIcon(cluster)}
                  </span>
                  <div>
                    <strong>{detail?.display_name ?? item.display_name}</strong>
                    <small>{detail?.room_name ?? item.room_name ?? "未分配房间"}</small>
                  </div>
                  <em>{stateLabel}</em>
                </div>

                {(cluster === "offline" || cluster === "battery") && !detail ? (
                  <p className="home-cluster-modal__device-note">
                    {(item.alert_badges ?? []).map((badge) => badge.text).join("，") ||
                      "待进一步检查"}
                  </p>
                ) : null}

                {powerSchema && detail ? (
                  <div className="home-cluster-modal__device-actions">
                    <button
                      disabled={Boolean(control.pendingByKey[powerKey])}
                      onClick={() =>
                        void control.submitControl({
                          detail,
                          overrideValue: true,
                          schema: powerSchema,
                          schemaIndex: powerIndex,
                        })
                      }
                      type="button"
                    >
                      开启
                    </button>
                    <button
                      disabled={Boolean(control.pendingByKey[powerKey])}
                      onClick={() =>
                        void control.submitControl({
                          detail,
                          overrideValue: false,
                          schema: powerSchema,
                          schemaIndex: powerIndex,
                        })
                      }
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
                            control.setValues((current) => {
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
                          {String(control.values[rangeKey] ?? getInitialValue(rangeSchema))}
                          {rangeSchema.unit ? ` ${rangeSchema.unit}` : ""}
                        </strong>
                        <button
                          onClick={() =>
                            control.setValues((current) => {
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
                        control.setValues((current) => ({
                          ...current,
                          [rangeKey]: Number(event.target.value),
                        }))
                      }
                      step={rangeNumber(rangeSchema.value_range?.step) ?? 1}
                      type="range"
                      value={Number(control.values[rangeKey] ?? getInitialValue(rangeSchema))}
                    />
                    <button
                      className="home-cluster-modal__apply"
                      disabled={Boolean(control.pendingByKey[rangeKey])}
                      onClick={() =>
                        void control.submitControl({
                          detail,
                          schema: rangeSchema,
                          schemaIndex: rangeIndex,
                        })
                      }
                      type="button"
                    >
                      应用
                    </button>
                  </div>
                ) : null}

                {modeSchema &&
                detail &&
                modeKey &&
                Array.isArray(modeSchema.allowed_values) ? (
                  <div className="home-cluster-modal__device-modes">
                    {modeSchema.allowed_values.slice(0, 4).map((option) => (
                      <button
                        key={String(option)}
                        className={control.values[modeKey] === option ? "is-active" : ""}
                        onClick={() => {
                          control.setValue(modeKey, option);
                          void control.submitControl({
                            detail,
                            overrideValue: option,
                            schema: modeSchema,
                            schemaIndex: modeIndex,
                          });
                        }}
                        type="button"
                      >
                        {formatOptionLabel(option)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {!powerSchema && !rangeSchema && !modeSchema ? (
                  <p className="home-cluster-modal__device-note">
                    当前没有可直接控制的项目，可进入设备详情继续操作。
                  </p>
                ) : null}

                {control.messageByDeviceId[deviceId] ? (
                  <p
                    className={`home-cluster-modal__feedback is-${feedbackTone(control.messageByDeviceId[deviceId])}`}
                  >
                    {control.messageByDeviceId[deviceId]}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
