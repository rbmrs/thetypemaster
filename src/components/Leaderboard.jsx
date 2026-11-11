import { useEffect, useState } from "react";
import { strings } from "../i18n.js";
import { DEVICE, fetchTop } from "../leaderboard.js";
import DeviceBadge from "./DeviceBadge.jsx";

const BOARDS = ["alltime", "weekly"];

const DURATIONS = [
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 180, label: "3m" },
];

const formatDate = (iso, locale) =>
  new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

// Top 10 for one round length on this device's board (desktop or phone).
// `initial` ({alltime, weekly}) skips the first fetch when the rows came back
// with a submit. `highlight` marks a name. `showDevice` puts the device icon
// at the end of the tab row; turn it off when the title carries the icon.
const Leaderboard = ({ duration, initial, highlight, showDurations = false, showDevice = true, lang }) => {
  const t = strings(lang);
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
          <div className="lb-tab-group" role="tablist" aria-label={t.roundLength}>
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
        <div className="lb-tab-group" role="tablist" aria-label={t.period}>
          {BOARDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`timer-option ${board === id ? "active" : ""}`}
              onClick={() => setBoard(id)}
            >
              {t.boards[id]}
            </button>
          ))}
        </div>
        {showDevice && <DeviceBadge lang={lang} />}
      </div>
      {error ? (
        <p className="lb-note">{t.boardUnavailable}</p>
      ) : rows === null ? (
        <p className="lb-note">{t.loading}</p>
      ) : rows.length === 0 ? (
        <p className="lb-note">{t.noScores}</p>
      ) : (
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="lb-name">{t.name}</th>
              <th>{t.score}</th>
              <th>{t.prec}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className={r.name.toLowerCase() === mine ? "lb-me" : ""} title={formatDate(r.date, t.locale)}>
                <td>{i + 1}</td>
                <td className="lb-name" title={r.name}>
                  {r.name}
                  {/* Same score as the row below: say why this one ranks higher. */}
                  {r.tieBreak && <span className="lb-tie">{t.tieBreak[r.tieBreak]}</span>}
                </td>
                <td>{r.cpm}</td>
                <td>{r.precision}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Leaderboard;
