import { useEffect, useState } from "react";
import { BOARDS, DEVICE, DEVICES, fetchTop } from "../leaderboard.js";

const DURATIONS = [
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 180, label: "3m" },
];

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

// Top 10 for one round length and device, starting on this device's board.
// `initial` ({alltime, weekly}) skips the first fetch when the rows came back
// with a submit. `highlight` marks a name.
const Leaderboard = ({ duration, initial, highlight, showDurations = false }) => {
  const [dur, setDur] = useState(duration);
  const [board, setBoard] = useState("alltime");
  const [device, setDevice] = useState(DEVICE);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const preset = dur === duration && device === DEVICE ? initial?.[board] : null;
    if (preset) {
      setRows(preset);
      setError(false);
      return;
    }
    let live = true;
    setRows(null);
    setError(false);
    fetchTop(dur, board, device)
      .then((r) => live && setRows(r))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [dur, board, device, duration, initial]);

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
        <div className="lb-tab-group" role="tablist" aria-label="Device">
          {DEVICES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`timer-option ${device === id ? "active" : ""}`}
              onClick={() => setDevice(id)}
            >
              {label}
            </button>
          ))}
        </div>
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
