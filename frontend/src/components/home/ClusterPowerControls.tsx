import type {
  ClusterControlSchema,
  ClusterDeviceDetail,
  DeviceControlFlow,
} from "./homeClusterControlTypes";

interface ClusterPowerControlsProps {
  control: DeviceControlFlow;
  detail: ClusterDeviceDetail;
  pending: boolean;
  schema: ClusterControlSchema;
  schemaIndex: number;
}

export function ClusterPowerControls({
  control,
  detail,
  pending,
  schema,
  schemaIndex,
}: ClusterPowerControlsProps) {
  return (
    <div className="home-cluster-modal__device-actions">
      <button
        disabled={pending}
        onClick={() =>
          void control.submitControl({
            detail,
            overrideValue: true,
            schema,
            schemaIndex,
          })
        }
        type="button"
      >
        开启
      </button>
      <button
        disabled={pending}
        onClick={() =>
          void control.submitControl({
            detail,
            overrideValue: false,
            schema,
            schemaIndex,
          })
        }
        type="button"
      >
        关闭
      </button>
    </div>
  );
}
