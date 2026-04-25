import { DeviceControlSchemaItemDto, DeviceDetailDto } from "../../api/types";
import { HomeHotspotViewModel } from "../../view-models/home";
import {
  controlSchemaKey,
  formatPowerStateLabel,
  isPowerControlSchema,
} from "./deviceControlHelpers";
import { HotspotIcon } from "./HotspotIcon";
import {
  actionSchemaTitle,
  detailState,
  getInitialValue,
  isNumberControlSchema,
  optionLabel,
  rangeNumber,
  schemaTitle,
  type DeviceCandidate,
} from "./homeHotspotControlModel";

interface HotspotDetailControlsProps {
  activeHotspot: HomeHotspotViewModel;
  loading: boolean;
  messages: Record<string, string>;
  pending: Record<string, boolean>;
  primaryCandidate: DeviceCandidate;
  primaryDetail: DeviceDetailDto | null;
  setControlValue: (key: string, value: unknown) => void;
  submitSchema: (
    detail: DeviceDetailDto,
    schema: DeviceControlSchemaItemDto,
    schemaIndex: number,
    overrideValue?: unknown,
  ) => void;
  values: Record<string, unknown>;
}

function DetailControl({
  detail,
  messages,
  pending,
  schema,
  schemaIndex,
  setControlValue,
  submitSchema,
  values,
}: Omit<HotspotDetailControlsProps, "activeHotspot" | "loading" | "primaryCandidate" | "primaryDetail"> & {
  detail: DeviceDetailDto;
  schema: DeviceControlSchemaItemDto;
  schemaIndex: number;
}) {
  const key = `${detail.device_id}:${controlSchemaKey(schema, schemaIndex)}`;
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
              setControlValue(key, true);
              void submitSchema(detail, schema, schemaIndex, true);
            }}
            type="button"
          >
            开启
          </button>
          <button
            className={value === false ? "is-active" : ""}
            disabled={disabled}
            onClick={() => {
              setControlValue(key, false);
              void submitSchema(detail, schema, schemaIndex, false);
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
        <div className="home-hotspot-control-modal__detail-inline">
          <div className="home-hotspot-control-modal__detail-stepper">
            <button
              disabled={disabled}
              onClick={() => setControlValue(key, Math.max(min, numericValue - step))}
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
              onClick={() => setControlValue(key, Math.min(max, numericValue + step))}
              type="button"
            >
              +
            </button>
          </div>
          <button
            className="home-hotspot-control-modal__detail-apply"
            disabled={disabled}
            onClick={() => void submitSchema(detail, schema, schemaIndex)}
            type="button"
          >
            应用
          </button>
        </div>
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
                setControlValue(key, option);
                void submitSchema(detail, schema, schemaIndex, option);
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
      <article className="home-hotspot-control-modal__detail-control is-action" key={key}>
        <span>{schemaTitle(schema)}</span>
        <button
          className="home-hotspot-control-modal__detail-apply"
          disabled={disabled}
          onClick={() => void submitSchema(detail, schema, schemaIndex, null)}
          type="button"
        >
          {actionSchemaTitle(schema)}
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
        onChange={(event) => setControlValue(key, event.target.value)}
        value={String(value ?? "")}
      />
      <button
        className="home-hotspot-control-modal__detail-apply"
        disabled={disabled}
        onClick={() => void submitSchema(detail, schema, schemaIndex)}
        type="button"
      >
        应用
      </button>
      {message ? <em>{message}</em> : null}
    </article>
  );
}

export function HotspotDetailControls({
  activeHotspot,
  loading,
  messages,
  pending,
  primaryCandidate,
  primaryDetail,
  setControlValue,
  submitSchema,
  values,
}: HotspotDetailControlsProps) {
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
        <div className="home-hotspot-control-modal__detail-controls">
          {schemas.map((schema, index) =>
            primaryDetail ? (
              <DetailControl
                detail={primaryDetail}
                key={`${primaryDetail.device_id}:${controlSchemaKey(schema, index)}`}
                messages={messages}
                pending={pending}
                schema={schema}
                schemaIndex={index}
                setControlValue={setControlValue}
                submitSchema={submitSchema}
                values={values}
              />
            ) : null,
          )}
        </div>
      </article>
    </div>
  );
}
