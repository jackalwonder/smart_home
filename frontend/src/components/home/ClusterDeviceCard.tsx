import { ClusterModeControls } from "./ClusterModeControls";
import { ClusterPowerControls } from "./ClusterPowerControls";
import { ClusterRangeControl } from "./ClusterRangeControl";
import {
  HomeClusterKey,
  clusterIcon,
  feedbackTone,
  formatRuntimeState,
  isBrightnessSchema,
  isModeSchema,
  isPowerSchema,
  isTemperatureSchema,
} from "./homeClusterControlModel";
import type {
  ClusterDeviceDetail,
  ClusterDeviceItem,
  DeviceControlFlow,
} from "./homeClusterControlTypes";

interface ClusterDeviceCardProps {
  cluster: HomeClusterKey;
  control: DeviceControlFlow;
  item: ClusterDeviceItem;
}

export function ClusterDeviceCard({ cluster, control, item }: ClusterDeviceCardProps) {
  const detail = isClusterDeviceDetail(item) ? item : null;
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
    cluster === "climate" ? (detail?.control_schema.findIndex(isModeSchema) ?? -1) : -1;
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
          {(item.alert_badges ?? []).map((badge) => badge.text).join("，") || "待进一步检查"}
        </p>
      ) : null}

      {powerSchema && detail ? (
        <ClusterPowerControls
          control={control}
          detail={detail}
          pending={Boolean(control.pendingByKey[powerKey])}
          schema={powerSchema}
          schemaIndex={powerIndex}
        />
      ) : null}

      {rangeSchema && detail && rangeKey ? (
        <ClusterRangeControl
          cluster={cluster}
          control={control}
          detail={detail}
          pending={Boolean(control.pendingByKey[rangeKey])}
          schema={rangeSchema}
          schemaIndex={rangeIndex}
          valueKey={rangeKey}
        />
      ) : null}

      {modeSchema && detail && modeKey && Array.isArray(modeSchema.allowed_values) ? (
        <ClusterModeControls
          control={control}
          detail={detail}
          schema={modeSchema}
          schemaIndex={modeIndex}
          valueKey={modeKey}
        />
      ) : null}

      {!powerSchema && !rangeSchema && !modeSchema ? (
        <p className="home-cluster-modal__device-note">
          当前没有可直接控制的项目，可进入设备详情继续操作。
        </p>
      ) : null}

      {control.messageByDeviceId[deviceId] ? (
        <p
          className={`home-cluster-modal__feedback is-${feedbackTone(
            control.messageByDeviceId[deviceId],
          )}`}
        >
          {control.messageByDeviceId[deviceId]}
        </p>
      ) : null}
    </article>
  );
}

function isClusterDeviceDetail(item: ClusterDeviceItem): item is ClusterDeviceDetail {
  return "control_schema" in item;
}
