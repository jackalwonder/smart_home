import { useState } from "react";

export function NoticeControlsSlide() {
  const [calendarOn, setCalendarOn] = useState(false);
  const [noticeOn, setNoticeOn] = useState(true);

  return (
    <article className="home-notice-slide">
      <header className="home-status-panel__header">
        <div>
          <span className="card-eyebrow">通知开关</span>
          <strong>快捷状态</strong>
        </div>
        <em>本地</em>
      </header>

      <div className="home-notice-slide__controls">
        <ToggleRow
          active={calendarOn}
          detail="CALENDAR_FULL_SWITCH"
          label="日程音响开关"
          onToggle={() => setCalendarOn((current) => !current)}
        />
        <ToggleRow
          active={noticeOn}
          detail="PUSH_AUDIO_CHILDREN_SWITCH"
          label="推送通知"
          onToggle={() => setNoticeOn((current) => !current)}
        />
      </div>
    </article>
  );
}

function ToggleRow({
  active,
  detail,
  label,
  onToggle,
}: {
  active: boolean;
  detail: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button className="home-toggle-row" onClick={onToggle} type="button">
      <span aria-hidden="true">🔔</span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <i className={active ? "is-active" : ""} />
    </button>
  );
}
