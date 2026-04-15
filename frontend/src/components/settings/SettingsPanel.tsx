interface SettingsPanelProps {
  title: string;
  description: string;
  payload: unknown;
  canSave: boolean;
  onSave: () => void;
  saving: boolean;
}

export function SettingsPanel({
  title,
  description,
  payload,
  canSave,
  onSave,
  saving,
}: SettingsPanelProps) {
  return (
    <section className="card settings-panel">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">Config Domain</span>
          <h3>{title}</h3>
        </div>
        <button className="ghost-button" disabled={!canSave || saving} onClick={onSave} type="button">
          {saving ? "Saving..." : "Save All"}
        </button>
      </div>
      <p className="page__hint">{description}</p>
      <pre className="json-block">{JSON.stringify(payload, null, 2)}</pre>
    </section>
  );
}
