import { HomeModuleField } from "../../view-models/home";

interface MediaEnergyCardProps {
  mediaFields: HomeModuleField[];
  energyFields: HomeModuleField[];
}

function friendlyValue(value: string) {
  switch (value) {
    case "MEDIA_UNSET":
    case "UNBOUND":
    case "-":
    case "--":
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

function FieldList({ fields, title }: { fields: HomeModuleField[]; title: string }) {
  const displayFields = fields.slice(0, 3);
  const primaryValue = friendlyValue(displayFields[0]?.value ?? "-");

  return (
    <div className="module-field-list">
      <div className="module-field-list__header">
        <h4>{title}</h4>
        <span className="state-chip">{primaryValue}</span>
      </div>
      <dl>
        {displayFields.map((field) => (
          <div key={`${title}-${field.label}`}>
            <dt>{field.label}</dt>
            <dd>{friendlyValue(field.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MediaEnergyCard({ mediaFields, energyFields }: MediaEnergyCardProps) {
  return (
    <section className="utility-card media-energy-card">
      <div className="media-energy-card__header">
        <div>
          <span className="card-eyebrow">服务状态</span>
          <h3>媒体与能耗</h3>
        </div>
      </div>
      <div className="media-energy-card__grid">
        <FieldList fields={mediaFields} title="媒体" />
        <FieldList fields={energyFields} title="能耗" />
      </div>
    </section>
  );
}
