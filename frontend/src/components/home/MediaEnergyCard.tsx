import { HomeModuleField } from "../../view-models/home";

interface MediaEnergyCardProps {
  mediaFields: HomeModuleField[];
  energyFields: HomeModuleField[];
}

function FieldList({ fields, title }: { fields: HomeModuleField[]; title: string }) {
  return (
    <div className="module-field-list">
      <h4>{title}</h4>
      <dl>
        {fields.map((field) => (
          <div key={`${title}-${field.label}`}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MediaEnergyCard({ mediaFields, energyFields }: MediaEnergyCardProps) {
  return (
    <section className="utility-card">
      <span className="card-eyebrow">服务侧栏</span>
      <h3>媒体与能耗</h3>
      <div className="media-energy-card__grid">
        <FieldList fields={mediaFields} title="媒体" />
        <FieldList fields={energyFields} title="能耗" />
      </div>
    </section>
  );
}
