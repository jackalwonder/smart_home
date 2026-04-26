import { formatOptionLabel } from "./homeClusterControlModel";
import type {
  ClusterControlSchema,
  ClusterDeviceDetail,
  DeviceControlFlow,
} from "./homeClusterControlTypes";

interface ClusterModeControlsProps {
  control: DeviceControlFlow;
  detail: ClusterDeviceDetail;
  schema: ClusterControlSchema;
  schemaIndex: number;
  valueKey: string;
}

export function ClusterModeControls({
  control,
  detail,
  schema,
  schemaIndex,
  valueKey,
}: ClusterModeControlsProps) {
  return (
    <div className="home-cluster-modal__device-modes">
      {schema.allowed_values?.slice(0, 4).map((option) => (
        <button
          key={String(option)}
          className={control.values[valueKey] === option ? "is-active" : ""}
          onClick={() => {
            control.setValue(valueKey, option);
            void control.submitControl({
              detail,
              overrideValue: option,
              schema,
              schemaIndex,
            });
          }}
          type="button"
        >
          {formatOptionLabel(option)}
        </button>
      ))}
    </div>
  );
}
