import { HomeClusterKey, getInitialValue, rangeNumber } from "./homeClusterControlModel";
import type {
  ClusterControlSchema,
  ClusterDeviceDetail,
  DeviceControlFlow,
} from "./homeClusterControlTypes";

interface ClusterRangeControlProps {
  cluster: HomeClusterKey;
  control: DeviceControlFlow;
  detail: ClusterDeviceDetail;
  pending: boolean;
  schema: ClusterControlSchema;
  schemaIndex: number;
  valueKey: string;
}

export function ClusterRangeControl({
  cluster,
  control,
  detail,
  pending,
  schema,
  schemaIndex,
  valueKey,
}: ClusterRangeControlProps) {
  const value = control.values[valueKey] ?? getInitialValue(schema);
  const step = rangeNumber(schema.value_range?.step) ?? 1;

  return (
    <div className="home-cluster-modal__device-range">
      <label>
        <span>{cluster === "lights" ? "亮度" : "目标温度"}</span>
        <div className="home-cluster-modal__stepper">
          <button
            onClick={() =>
              control.setValues((current) => ({
                ...current,
                [valueKey]: (rangeNumber(current[valueKey]) ?? 0) - step,
              }))
            }
            type="button"
          >
            −
          </button>
          <strong>
            {String(value)}
            {schema.unit ? ` ${schema.unit}` : ""}
          </strong>
          <button
            onClick={() =>
              control.setValues((current) => ({
                ...current,
                [valueKey]: (rangeNumber(current[valueKey]) ?? 0) + step,
              }))
            }
            type="button"
          >
            +
          </button>
        </div>
      </label>
      <input
        max={rangeNumber(schema.value_range?.max)}
        min={rangeNumber(schema.value_range?.min)}
        onChange={(event) =>
          control.setValues((current) => ({
            ...current,
            [valueKey]: Number(event.target.value),
          }))
        }
        step={step}
        type="range"
        value={Number(value)}
      />
      <button
        className="home-cluster-modal__apply"
        disabled={pending}
        onClick={() =>
          void control.submitControl({
            detail,
            schema,
            schemaIndex,
          })
        }
        type="button"
      >
        应用
      </button>
    </div>
  );
}
