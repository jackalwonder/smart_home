import { HomeModuleField } from "../../view-models/home";

interface MediaEnergyCardProps {
  mediaFields: HomeModuleField[];
  energyFields: HomeModuleField[];
}

function friendlyValue(value: string) {
  switch (value) {
    case "MEDIA_UNSET":
    case "UNBOUND":
      return "待绑定";
    case "BOUND":
      return "已绑定";
    case "AVAILABLE":
      return "可用";
    case "UNAVAILABLE":
      return "不可用";
    default:
      return value || "-";
  }
}

function FieldList({
  fields,
  title,
}: {
  fields: HomeModuleField[];
  title: string;
}) {
  const headline = friendlyValue(
    fields.find((field) => field.label.includes("状态"))?.value ?? "-",
  );
  const visibleFields = fields.filter((field) => {
    const value = friendlyValue(field.value);
    return (
      field.label.includes("状态") || (value !== "-" && value !== "待绑定")
    );
  });
  const emptyMessage =
    title === "媒体"
      ? "绑定默认媒体设备后，会显示可用性、播放状态和曲目信息。"
      : "绑定能耗服务后，会显示刷新状态、本月用量和余额。";

  return (
    <div className="module-field-list">
      <div className="module-field-list__header">
        <h4>{title}</h4>
        <span
          className={
            headline === "待绑定" ? "state-chip is-warming" : "state-chip"
          }
        >
          {headline}
        </span>
      </div>
      {visibleFields.length > 0 ? (
        <dl>
          {visibleFields.map((field) => (
            <div key={`${title}-${field.label}`}>
              <dt>{field.label}</dt>
              <dd>{friendlyValue(field.value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="module-field-list__empty">{emptyMessage}</p>
      )}
    </div>
  );
}

export function MediaEnergyCard({
  mediaFields,
  energyFields,
}: MediaEnergyCardProps) {
  return (
    <section className="utility-card media-energy-card">
      <span className="card-eyebrow">服务状态</span>
      <h3>媒体与能耗</h3>
      <div className="media-energy-card__grid">
        <FieldList fields={mediaFields} title="媒体" />
        <FieldList fields={energyFields} title="能耗" />
      </div>
    </section>
  );
}
