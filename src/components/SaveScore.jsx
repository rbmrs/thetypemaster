import { useEffect, useRef, useState } from "react";
import { strings } from "../i18n.js";
import { NAME_KEY, NAME_RE, claimRound, cleanName, randomName, saveOutcome, storedName, submitScore } from "../leaderboard.js";

// "Save to leaderboard" row on the results card. `token` is a promise for
// the round token (null when the Worker was unreachable at round start).
// The first save asks for a name; after that each round saves on its own
// under the stored name, and "Change name" asks again. `saved`: this round
// is on the board, so a new name is kept for the next rounds.
// onSaved(data, auto): `auto` is true for a save without a click.
const SaveScore = ({ token, result, saved, onSaved, lang }) => {
  const t = strings(lang);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || "");
  // Show the name field, dice and Save: no name stored yet, or "Change name".
  const [asking, setAsking] = useState(() => !storedName());
  const [saving, setSaving] = useState(false);
  // A string key, so the text follows a language change.
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(false);
  // The new name for the next rounds, when changed after this round saved.
  const [renamed, setRenamed] = useState("");
  // The name this round saved as, for screen readers (the card shows it too).
  const [savedAs, setSavedAs] = useState("");
  const [available, setAvailable] = useState(true);
  // False once really unmounted (a new round), so a late reply is dropped.
  // StrictMode's test unmount sets it back to true on remount.
  const mounted = useRef(true);
  const inputRef = useRef(null);
  const changeRef = useRef(null);
  // After a click, move focus to the field or to the link that replaces it.
  const focusNext = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    Promise.resolve(token).then((tok) => live && setAvailable(Boolean(tok)));
    return () => {
      live = false;
    };
  }, [token]);

  const send = async (clean, auto) => {
    // A manual save claims the token too, so a remount can't save it again.
    claimRound(token);
    setSaving(true);
    setMessage("");
    setRetry(false);
    try {
      const tok = await token;
      if (!tok) throw new Error("unavailable");
      const data = await submitScore({ token: tok, name: clean, ...result });
      localStorage.setItem(NAME_KEY, clean);
      if (!mounted.current) return;
      setSaving(false);
      setSavedAs(data.name);
      setAsking(false);
      onSaved(data, auto);
    } catch (err) {
      if (!mounted.current) return;
      const outcome = saveOutcome(err);
      setMessage(outcome.key);
      setRetry(outcome.retry);
      // A stored name the server refuses: forget it and ask for another one.
      if (outcome.ask) {
        if (storedName() === clean) localStorage.removeItem(NAME_KEY);
        setAsking(true);
      }
      setSaving(false);
    }
  };

  // With a stored name the round saves as soon as it ends, once per token.
  useEffect(() => {
    if (!saved && !asking && claimRound(token)) send(storedName(), true);
  }, [token]);

  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    (asking ? inputRef : changeRef).current?.focus();
  }, [asking]);

  if (!available) return <p className="lb-note lb-save-note">{t.saveUnavailable}</p>;

  const submit = (e) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!NAME_RE.test(clean)) {
      setMessage("nameRule");
      return;
    }
    focusNext.current = true;
    if (!saved) {
      send(clean, false);
      return;
    }
    // This round is on the board already: keep the name for the next ones.
    localStorage.setItem(NAME_KEY, clean);
    setRenamed(clean);
    setMessage("");
    setAsking(false);
  };

  const changeName = () => {
    if (saving) return;
    focusNext.current = true;
    setName(storedName() || name);
    setMessage("");
    setRenamed("");
    setAsking(true);
  };

  const cancel = () => {
    focusNext.current = true;
    setMessage("");
    setAsking(false);
  };

  // Retry hides while saving: keep focus on "Change name" instead of the page.
  const retrySave = () => {
    changeRef.current?.focus();
    send(storedName(), true);
  };

  if (!asking) {
    return (
      <div className="lb-save lb-auto">
        <p className="lb-note lb-save-note" role="status">
          {saving ? t.saving : message && t[message]}
          {!saving && !message && !renamed && savedAs && (
            <span className="visually-hidden">
              {t.savedAs} {savedAs}
            </span>
          )}
          {renamed && (
            <>
              {t.nextRoundsAs} <strong>{renamed}</strong>
            </>
          )}
        </p>
        <div className="lb-auto-row">
          {retry && !saving && (
            <button type="button" className="lb-save-button" onClick={retrySave}>
              {t.retry}
            </button>
          )}
          <button type="button" className="lb-change" ref={changeRef} onClick={changeName}>
            {t.changeName}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="lb-save" onSubmit={submit}>
      <div className="lb-save-label">{saved ? t.nameLabel : t.saveTo}</div>
      <div className="lb-save-row">
        <input
          ref={inputRef}
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
          {saving ? t.saving : saved ? t.useName : t.save}
        </button>
      </div>
      {message && <p className="lb-note lb-save-note">{t[message]}</p>}
      {storedName() && (
        <div className="lb-auto-row">
          <button type="button" className="lb-change" onClick={cancel}>
            {t.cancel}
          </button>
        </div>
      )}
    </form>
  );
};

export default SaveScore;
