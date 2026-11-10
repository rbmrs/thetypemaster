import { useEffect, useState } from "react";
import { NAME_KEY, NAME_RE, cleanName, randomName, submitScore } from "../leaderboard.js";

const ERRORS = {
  "bad name": "That name isn't allowed.",
  "token already used": "Already saved.",
  "token expired": "This round is too old to save.",
};

// "Save to leaderboard" row on the results card. `token` is a promise for
// the round token (null when the Worker was unreachable at round start).
const SaveScore = ({ token, result, onSaved }) => {
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.resolve(token).then((t) => live && setAvailable(Boolean(t)));
    return () => {
      live = false;
    };
  }, [token]);

  if (!available) return <p className="lb-note lb-save-note">Saving is unavailable right now.</p>;

  const save = async (e) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!NAME_RE.test(clean)) {
      setMessage("Use 2–16 letters, digits, spaces, _ or -.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const t = await token;
      if (!t) throw new Error("unavailable");
      const data = await submitScore({ token: t, name: clean, ...result });
      localStorage.setItem(NAME_KEY, clean);
      onSaved(data);
    } catch (err) {
      setMessage(ERRORS[err.message] || (err.status === 429 ? "Too many saves. Try later." : "Couldn't save."));
      setSaving(false);
    }
  };

  return (
    <form className="lb-save" onSubmit={save}>
      <div className="lb-save-label">Save to leaderboard</div>
      <div className="lb-save-row">
        <input
          className="lb-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={16}
          aria-label="Name for the leaderboard"
          autoComplete="nickname"
          spellCheck={false}
        />
        <button
          type="button"
          className="lb-dice"
          onClick={() => setName(randomName())}
          aria-label="Random name"
          title="Random name"
        >
          🎲
        </button>
        <button type="submit" className="lb-save-button" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {message && <p className="lb-note lb-save-note">{message}</p>}
    </form>
  );
};

export default SaveScore;
