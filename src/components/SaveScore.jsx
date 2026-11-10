import { useEffect, useState } from "react";
import { strings } from "../i18n.js";
import { NAME_KEY, NAME_RE, cleanName, randomName, submitScore } from "../leaderboard.js";

// Worker error text (unchanged, English) to the string key shown here.
const ERRORS = {
  "bad name": "badName",
  "token already used": "alreadySaved",
  "token expired": "tooOld",
};

// "Save to leaderboard" row on the results card. `token` is a promise for
// the round token (null when the Worker was unreachable at round start).
const SaveScore = ({ token, result, onSaved, lang }) => {
  const t = strings(lang);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  const [saving, setSaving] = useState(false);
  // A string key, so the text follows a language change.
  const [message, setMessage] = useState("");
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.resolve(token).then((tok) => live && setAvailable(Boolean(tok)));
    return () => {
      live = false;
    };
  }, [token]);

  if (!available) return <p className="lb-note lb-save-note">{t.saveUnavailable}</p>;

  const save = async (e) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!NAME_RE.test(clean)) {
      setMessage("nameRule");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const tok = await token;
      if (!tok) throw new Error("unavailable");
      const data = await submitScore({ token: tok, name: clean, ...result });
      localStorage.setItem(NAME_KEY, clean);
      onSaved(data);
    } catch (err) {
      setMessage(ERRORS[err.message] || (err.status === 429 ? "tooMany" : "saveFailed"));
      setSaving(false);
    }
  };

  return (
    <form className="lb-save" onSubmit={save}>
      <div className="lb-save-label">{t.saveTo}</div>
      <div className="lb-save-row">
        <input
          className="lb-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.yourName}
          maxLength={16}
          aria-label={t.nameLabel}
          autoComplete="nickname"
          spellCheck={false}
        />
        <button
          type="button"
          className="lb-dice"
          onClick={() => setName(randomName(lang))}
          aria-label={t.randomName}
          title={t.randomName}
        >
          🎲
        </button>
        <button type="submit" className="lb-save-button" disabled={saving}>
          {saving ? t.saving : t.save}
        </button>
      </div>
      {message && <p className="lb-note lb-save-note">{t[message]}</p>}
    </form>
  );
};

export default SaveScore;
