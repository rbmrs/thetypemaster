import { useEffect, useState } from "react";
import { BOARDS, DEVICE, fetchTop } from "../leaderboard.js";

const DEVICE_INFO =
  DEVICE === "phone"
    ? { label: "Phone leaderboard", tip: "Phone board: scores from touch screens. Desktop players have their own board." }
    : { label: "Desktop leaderboard", tip: "Desktop board: scores from physical keyboards. Phone players have their own board." };

const DURATIONS = [
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 180, label: "3m" },
];

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// Top 10 for one round length on this device's board (desktop or phone).
// `initial` ({alltime, weekly}) skips the first fetch when the rows came back
// with a submit. `highlight` marks a name.
const Leaderboard = ({ duration, initial, highlight, showDurations = false }) => {
  const [dur, setDur] = useState(duration);
  const [board, setBoard] = useState("alltime");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const preset = dur === duration ? initial?.[board] : null;
    if (preset) {
      setRows(preset);
      setError(false);
      return;
    }
    let live = true;
    setRows(null);
    setError(false);
    fetchTop(dur, board, DEVICE)
      .then((r) => live && setRows(r))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [dur, board, duration, initial]);

  const mine = highlight?.toLowerCase();

  return (
    <div className="lb">
      <div className="lb-tabs">
        {showDurations && (
          <div className="lb-tab-group" role="tablist" aria-label="Round length">
            {DURATIONS.map(({ seconds, label }) => (
              <button
                key={seconds}
                type="button"
                className={`timer-option ${dur === seconds ? "active" : ""}`}
                onClick={() => setDur(seconds)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="lb-tab-group" role="tablist" aria-label="Period">
          {BOARDS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`timer-option ${board === id ? "active" : ""}`}
              onClick={() => setBoard(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="lb-device" tabIndex={0} aria-label={DEVICE_INFO.tip}>
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
            {DEVICE_INFO.tip}
          </span>
        </span>
      </div>
      {error ? (
        <p className="lb-note">Leaderboard unavailable.</p>
      ) : rows === null ? (
        <p className="lb-note">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="lb-note">No scores yet.</p>
      ) : (
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="lb-name">Name</th>
              <th>Score</th>
              <th>WPM</th>
              <th>Acc.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className={r.name.toLowerCase() === mine ? "lb-me" : ""} title={formatDate(r.date)}>
                <td>{i + 1}</td>
                <td className="lb-name" title={r.name}>
                  {r.name}
                </td>
                <td>{r.score}</td>
                <td>{r.wpm}</td>
                <td>{r.accuracy}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Leaderboard;
