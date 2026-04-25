import { DeviceControlSchemaItemDto } from "../../api/types";
import {
  describeAction,
  formatOptionLabel,
  getRangeNumber,
  isBooleanSchema,
  isNumberSchema,
} from "./homeDeviceControlModel";

interface HomeDeviceControlInputProps {
  schema: DeviceControlSchemaItemDto;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function HomeDeviceControlInput({
  schema,
  value,
  onChange,
}: HomeDeviceControlInputProps) {
  const action = describeAction(schema);
  const type = schema.value_type?.toUpperCase() ?? "NONE";
  if (type === "NONE") {
    return (
      <p className="home-device-control-panel__hint">
        这个动作不需要额外输入，直接执行即可。
      </p>
    );
  }

  if (Array.isArray(schema.allowed_values) && schema.allowed_values.length > 0) {
    return (
      <div className="home-device-control-panel__chips">
        {schema.allowed_values.map((option) => (
          <button
            aria-label={formatOptionLabel(option)}
            key={String(option)}
            className={value === option ? "is-active" : ""}
            onClick={() => onChange(option)}
            type="button"
          >
            {formatOptionLabel(option)}
          </button>
        ))}
      </div>
    );
  }

  if (isBooleanSchema(schema)) {
    return (
      <div
        className="home-device-control-panel__segmented"
        role="group"
        aria-label={action.valueLabel}
      >
        <button
          aria-label="开启"
          className={Boolean(value) ? "is-active" : ""}
          onClick={() => onChange(true)}
          type="button"
        >
          开启
        </button>
        <button
          aria-label="关闭"
          className={!Boolean(value) ? "is-active" : ""}
          onClick={() => onChange(false)}
          type="button"
        >
          关闭
        </button>
      </div>
    );
  }

  if (isNumberSchema(schema)) {
    const min = getRangeNumber(schema.value_range?.min);
    const max = getRangeNumber(schema.value_range?.max);
    const step = getRangeNumber(schema.value_range?.step) ?? 1;
    return (
      <div className="home-device-control-panel__range">
        {min !== undefined && max !== undefined ? (
          <input
            aria-label={`${action.valueLabel}滑杆`}
            max={max}
            min={min}
            onChange={(event) => onChange(Number(event.target.value))}
            step={step}
            type="range"
            value={Number(value ?? min)}
          />
        ) : null}
        <input
          aria-label={action.valueLabel}
          className="control-input"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="number"
          value={String(value ?? "")}
        />
        {schema.unit ? <small>{`单位 ${schema.unit}`}</small> : null}
      </div>
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
