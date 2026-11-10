import { strings } from "../i18n.js";
import { DEVICE } from "../leaderboard.js";

// Desktop or phone icon for this device's board. Hover, focus or tap shows
// a bubble that explains the separate boards.
const DeviceBadge = ({ lang, className = "" }) => {
  const tip = strings(lang).deviceTip[DEVICE];
  return (
    <span className={`lb-device ${className}`.trim()} tabIndex={0} aria-label={tip}>
      {DEVICE === "phone" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="2.5" width="10" height="19" rx="2" />
          <path d="M11 18.5h2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M8 20h8M12 16v4" />
        </svg>
      )}
      <span className="lb-device-tip" aria-hidden="true">
        {tip}
      </span>
    </span>
  );
};

export default DeviceBadge;
