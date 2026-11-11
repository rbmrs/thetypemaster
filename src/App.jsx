import { useEffect, useRef, useState } from "react";
import Keyboard from "./components/Keyboard.jsx";
import LangMenu, { LANGS } from "./components/LangMenu.jsx";
import DeviceBadge from "./components/DeviceBadge.jsx";
import Leaderboard from "./components/Leaderboard.jsx";
import SaveScore from "./components/SaveScore.jsx";
import WordDisplay from "./components/WordDisplay.jsx";
import { strings } from "./i18n.js";
import { startRound } from "./leaderboard.js";
import { correctPrefix, formatWpm, scoreRound } from "./scoring.js";
import { playCorrect, playTimeUp, playWrong, setSoundOn, soundOn, unlockSound } from "./sound.js";

const STATS_KEY = "typeMasterStats";
const THEME_KEY = "theme";
const LANG_KEY = "typeMasterLang";

const RESET_ICON =
  "M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z";
const SOUND_ON_ICON =
  "M3,9V15H7L12,20V4L7,9H3M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16.02C15.5,15.29 16.5,13.76 16.5,12M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23Z";
const SOUND_OFF_ICON =
  "M3,9H7L12,4V20L7,15H3V9M16.59,12L14,9.41L15.41,8L18,10.59L20.59,8L22,9.41L19.41,12L22,14.59L20.59,16L18,13.41L15.41,16L14,14.59L16.59,12Z";
const INFO_ICON =
  "M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";

const TIMER_OPTIONS = [
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 180, label: "3m" },
];

// Word language. Both share one leaderboard, so saving works the same.
// A saved manual pick wins; otherwise the browser's top language decides.
// The automatic choice is not saved.
const startLang = () => {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (LANGS.some((o) => o.lang === v)) return v;
  } catch {
    // No storage: fall through to the browser language.
  }
  const top = (navigator.languages && navigator.languages[0]) || navigator.language || "";
  return top.toLowerCase().startsWith("pt") ? "pt" : "en";
};

// Set in index.html: phones and tablets type with their own keyboard app.
const IS_TOUCH = document.documentElement.classList.contains("touch");

// Phone width, the same breakpoint as the html.touch phone rules in index.css.
// There the saved leaderboard gets its own page instead of sitting below the results.
const PHONE_QUERY = "(max-width: 600px)";
const usePhone = () => {
  const [phone, setPhone] = useState(() => IS_TOUCH && window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    if (!IS_TOUCH) return;
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return phone;
};

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Top lists from the server hold 10 rows.
const BOARD_SIZE = 10;
const TROPHY_ICON =
  "M7 4V2h10v2h4v3a4 4 0 0 1-4 4h-.35A5 5 0 0 1 13 13.9V17h3v2H8v-2h3v-3.1A5 5 0 0 1 7.35 11H7a4 4 0 0 1-4-4V4h4Zm0 2H5v1a2 2 0 0 0 2 2V6Zm10 0v3a2 2 0 0 0 2-2V6h-2Z";

// The server ranks each player's best score. The rank belongs to this round
// only when the round is that best (`current`); show it only when it makes the board.
function boardPlaces(rank, labels) {
  return ["alltime", "weekly"]
    .map((id) => ({ id, label: labels[id], r: rank?.[id] }))
    .filter(({ r }) => r && r.current && r.rank <= BOARD_SIZE)
    .map(({ id, label, r }) => ({ id, text: `#${r.rank} ${label}` }));
}

function App() {
  const [typedText, setTypedText] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const [keyStatus, setKeyStatus] = useState("");
  const [wordsAttempted, setWordsAttempted] = useState(0);
  const [wordsCorrect, setWordsCorrect] = useState(0);
  // Net WPM counts (see scoring.js): characters of correct words (letters +
  // space) and every letter key, deleted ones included.
  const [correctChars, setCorrectChars] = useState(0);
  const [letterKeys, setLetterKeys] = useState(0);
  const [correctLetterKeys, setCorrectLetterKeys] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [currentWord, setCurrentWord] = useState("");
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [lang, setLang] = useState(startLang);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [sound, setSound] = useState(soundOn);
  const t = strings(lang);
  // Leaderboard: round token promise (from POST /start), the submit reply,
  // and the standalone board overlay.
  const [roundToken, setRoundToken] = useState(null);
  const [saved, setSaved] = useState(null);
  const [showBoard, setShowBoard] = useState(false);
  // Phones: the results card and the saved leaderboard are two pages.
  const isPhone = usePhone();
  const [boardPage, setBoardPage] = useState(false);
  const pageFocusRef = useRef(null);
  // Touch devices only: the real input that opens the phone's keyboard.
  const inputRef = useRef(null);

  // Page language for screen readers, spell check and translation tools.
  useEffect(() => {
    document.documentElement.lang = t.locale;
  }, [t]);

  // Clear the on-screen key highlight shortly after each press.
  useEffect(() => {
    if (!activeKey) return;
    const t = setTimeout(() => {
      setActiveKey("");
      setKeyStatus("");
    }, 300);
    return () => clearTimeout(t);
  }, [activeKey]);

  // The round's counts when time is up. The word being typed adds its
  // correct start (no space) and is not a wrong word. These counts go to the
  // server, which works out the score itself.
  const counts = gameOver
    ? {
        correctChars: correctChars + correctPrefix(typedText, currentWord),
        letterKeys,
        correctLetterKeys,
        wordsTyped: wordsAttempted,
        wordsCorrect,
      }
    : null;
  const final = counts && scoreRound({ duration: selectedDuration, ...counts });

  // Last round's result, written only (version 2; nothing reads it back, so
  // an older saved shape can't break the game).
  useEffect(() => {
    if (!final) return;
    try {
      localStorage.setItem(
        STATS_KEY,
        JSON.stringify({ version: 2, duration: selectedDuration, ...counts, ...final }),
      );
    } catch {
      // No storage: skip.
    }
  }, [gameOver]);

  useEffect(() => {
    let interval;
    if (timerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setGameOver(true);
            setShowResults(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => interval && clearInterval(interval);
  }, [timerRunning, timeLeft]);

  const selectDuration = (seconds) => {
    if (timerRunning) return;
    setSelectedDuration(seconds);
    setTimeLeft(seconds);
  };

  // Same rule as the duration: no change mid-round. Saved, because the
  // player picked it. The language sets all game text. WordDisplay remounts
  // on the new key, so the whole row is new words in the chosen language.
  const selectLang = (next) => {
    if (timerRunning || next === lang) return;
    setLang(next);
    setTypedText("");
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
  };

  const resetGame = () => {
    setTypedText("");
    setWordsAttempted(0);
    setWordsCorrect(0);
    setCorrectChars(0);
    setLetterKeys(0);
    setCorrectLetterKeys(0);
    setStartTime(null);
    setTimeLeft(selectedDuration);
    setTimerRunning(false);
    setGameOver(false);
    setShowResults(false);
    setRoundToken(null);
    setSaved(null);
    setBoardPage(false);
    if (typeof window.advanceWords === "function") {
      for (let i = 0; i < 7; i++) window.advanceWords();
    }
    focusPhoneInput();
  };

  // `pos`, `started` and `word` let the phone input apply several keys from one event.
  const typeLetter = (letter, pos = typedText.length, started = Boolean(startTime), word = currentWord) => {
    // A letter key is correct when it matches the word's letter at that position.
    const isCorrect = word[pos]?.toLowerCase() === letter;
    setLetterKeys((n) => n + 1);
    if (isCorrect) setCorrectLetterKeys((n) => n + 1);
    setTypedText((t) => t + letter);
    setActiveKey(letter);
    setKeyStatus(isCorrect ? "correct" : "incorrect");
    if (!started) {
      setStartTime(Date.now());
      setTimerRunning(true);
      // Ask for a round token; if this fails the game still works, only saving is off.
      setRoundToken(startRound(selectedDuration));
    }
  };

  const backspace = () => {
    setTypedText((t) => t.slice(0, -1));
    setActiveKey("Backspace");
    setKeyStatus("");
  };

  // Returns the next word to type. `chain` lets the phone input submit more
  // than one word in a single event (see WordDisplay).
  const submitWord = (text = typedText, word = currentWord, chain = false) => {
    if (text.trim() === "") return word;
    setWordsAttempted((n) => n + 1);
    const isCorrect = text.trim().toLowerCase() === word.toLowerCase();
    if (isCorrect) {
      setWordsCorrect((n) => n + 1);
      // Its letters and the space.
      setCorrectChars((n) => n + word.length + 1);
      playCorrect();
    } else {
      playWrong();
    }
    const typed = text.trim();
    setTypedText("");
    if (typeof window.advanceWords === "function") return window.advanceWords(typed, isCorrect, chain);
    return word;
  };

  // A plain function, so it sees this render's state (the picked duration,
  // the language, the word). The document listener calls it through
  // keyDownRef, which always holds the newest one.
  const handleKeyDown = (e) => {
    if (gameOver || showBoard || langMenuOpen) return;
    if (e.target instanceof HTMLInputElement) return;
    // Space and Enter on the flag or sound button press it; they are not typing.
    if (e.target instanceof Element && e.target.closest(".lang-menu, .sound-toggle") && !/^[a-z]$/i.test(e.key)) return;
    if (/^[a-z]$/i.test(e.key)) {
      typeLetter(e.key.toLowerCase());
    } else if (e.key === "Backspace") {
      backspace();
    } else if (e.key === " " || e.key === "Space" || e.key === "Enter") {
      submitWord();
    }
  };
  const keyDownRef = useRef(handleKeyDown);
  keyDownRef.current = handleKeyDown;

  // Phone keyboard: read the input's new value, not keydown (Android sends
  // "Unidentified"). Replay the change as the same backspaces, letters and
  // Space a desktop player would press, so the counts (letter keys included)
  // and the score are the same.
  const handlePhoneInput = (e) => {
    if (gameOver || showBoard) return;
    const value = e.target.value.toLowerCase();
    let keep = 0;
    while (keep < typedText.length && value[keep] === typedText[keep]) keep++;
    for (let i = typedText.length; i > keep; i--) backspace();
    // Swipe typing and paste can bring a Space and the next word in one
    // event, so track the word and typed text locally as a desktop player
    // pressing the same keys would see them.
    let text = typedText.slice(0, keep);
    let word = currentWord;
    let started = Boolean(startTime);
    for (const ch of value.slice(keep)) {
      if (/^[a-z]$/.test(ch)) {
        typeLetter(ch, text.length, started, word);
        text += ch;
        started = true;
      } else if (/\s/.test(ch) && text !== "") {
        // A Space on an empty box does nothing, as on desktop.
        word = submitWord(text, word, true);
        text = "";
      }
    }
  };

  const handlePhoneKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!gameOver && !showBoard) submitWord();
  };

  // Called inside the tap, so iOS opens the keyboard. Clear readOnly first:
  // after a round it is still set, and iOS won't open the keyboard for it.
  const focusPhoneInput = () => {
    const input = IS_TOUCH && inputRef.current;
    if (!input) return;
    input.readOnly = false;
    input.focus();
  };

  // On-screen keyboard input.
  const handleVirtualKey = (key) => {
    if (gameOver) return;
    if (key === "Backspace") {
      backspace();
    } else if (key === " ") {
      setActiveKey(" ");
      setKeyStatus("");
      submitWord();
    } else {
      typeLetter(key);
    }
  };

  // Follow the rbmrs.dev theme toggle live. Same origin, so a toggle on the
  // parent page fires a "storage" event here.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== THEME_KEY) return;
      const root = document.documentElement;
      if (e.newValue === "light" || e.newValue === "dark") root.setAttribute("data-theme", e.newValue);
      else root.removeAttribute("data-theme");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!showBoard) return;
    const onKey = (e) => e.key === "Escape" && closeBoard();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showBoard]);

  // Phones: move focus to the page that just opened (its first button).
  useEffect(() => {
    pageFocusRef.current?.focus();
  }, [boardPage]);

  // Drop focus from the overlay buttons so Space doesn't press them again.
  const closeBoard = () => {
    setShowBoard(false);
    document.activeElement?.blur?.();
  };

  // Touch: a tap anywhere outside buttons, links and inputs opens the keyboard.
  // It has to be focus() inside the tap, or iOS won't show the keyboard.
  useEffect(() => {
    if (!IS_TOUCH) return;
    const onClick = (e) => {
      if (e.target.closest("button, a, input, .modal-overlay")) return;
      focusPhoneInput();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Browsers allow sound only after a user gesture: make the audio context
  // on the first key press or tap. Touch screens count only the end of a tap.
  useEffect(() => {
    const unlock = () => unlockSound();
    const events = ["keydown", "pointerdown", "pointerup", "touchend"];
    for (const ev of events) document.addEventListener(ev, unlock, true);
    return () => {
      for (const ev of events) document.removeEventListener(ev, unlock, true);
    };
  }, []);

  useEffect(() => {
    if (gameOver) playTimeUp();
  }, [gameOver]);

  // A mouse click or tap gives focus back to the game, so the next Space
  // submits a word. Space or Enter on the focused button keeps focus on it.
  const toggleSound = (e) => {
    const next = !sound;
    setSound(next);
    setSoundOn(next);
    if (e.detail > 0) {
      e.currentTarget.blur();
      if (timerRunning && !gameOver) focusPhoneInput();
    }
  };

  // Close the keyboard when time is up, so the results card is in full view.
  useEffect(() => {
    if (IS_TOUCH && gameOver) inputRef.current?.blur();
  }, [gameOver]);

  // Touch: lay the game out in the part of the screen the keyboard doesn't
  // cover (--vv-top / --vv-height, used in index.css). Inside the rbmrs.dev
  // iframe the keyboard shrinks the parent page's visual viewport, not ours,
  // so while typing, also fit to the part of the frame the parent shows.
  useEffect(() => {
    if (!IS_TOUCH) return;
    const root = document.documentElement;
    const own = window.visualViewport;
    let frame = null;
    let host = null;
    try {
      frame = window.frameElement;
      host = frame ? window.parent.visualViewport : null;
    } catch {
      // Cross-origin parent: only our own viewport can be read.
    }
    const update = () => {
      let top = own ? own.offsetTop : 0;
      let height = own ? own.height : window.innerHeight;
      if (frame && host && document.activeElement === inputRef.current) {
        const rect = frame.getBoundingClientRect();
        const shownTop = Math.max(0, host.offsetTop - rect.top);
        const shownBottom = Math.min(rect.height, host.offsetTop + host.height - rect.top);
        if (shownBottom - shownTop >= 200) {
          top = shownTop;
          height = shownBottom - shownTop;
        }
      }
      root.style.setProperty("--vv-top", `${Math.round(top)}px`);
      root.style.setProperty("--vv-height", `${Math.round(height)}px`);
    };
    const targets = [own, host, window].filter(Boolean);
    update();
    for (const t of targets) t.addEventListener("resize", update);
    for (const t of [own, host].filter(Boolean)) t.addEventListener("scroll", update);
    // activeElement settles after focusin/focusout, so read it a tick later.
    const later = () => setTimeout(update, 0);
    document.addEventListener("focusin", later);
    document.addEventListener("focusout", later);
    return () => {
      for (const t of targets) t.removeEventListener("resize", update);
      for (const t of [own, host].filter(Boolean)) t.removeEventListener("scroll", update);
      document.removeEventListener("focusin", later);
      document.removeEventListener("focusout", later);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => keyDownRef.current(e);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // "Saved as <name>" and this round's place badges.
  const savedRank = saved && (
    <p className="lb-rank">
      {t.savedAs} <strong>{saved.name}</strong>
      {boardPlaces(saved.rank, t.places).map(({ id, text }) => (
        <span key={id} className="lb-place">
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
            <path d={TROPHY_ICON} />
          </svg>
          {text}
        </span>
      ))}
    </p>
  );

  return (
    <>
      <div className="app">
        <h1>Type Master</h1>
        <nav className="site-nav">
          <a href="https://rbmrs.dev/">rbmrs.dev</a>
          {!timerRunning && !showResults && (
            <button type="button" className="nav-button" onClick={() => setShowBoard(true)}>
              {t.leaderboard}
            </button>
          )}
        </nav>
      </div>

      <div className="top-tools">
        {!timerRunning && (
          <LangMenu lang={lang} onSelect={selectLang} open={langMenuOpen} setOpen={setLangMenuOpen} />
        )}
        <button
          type="button"
          className="sound-toggle"
          aria-label={t.sound}
          aria-pressed={sound}
          title={sound ? t.soundOn : t.soundOff}
          onClick={toggleSound}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
            <path d={sound ? SOUND_ON_ICON : SOUND_OFF_ICON} />
          </svg>
        </button>
      </div>

      <div className="timer-container">
        <div className="timer-display">
          {formatTime(timeLeft)}
          {timerRunning && (
            <button className="reset-button" onClick={resetGame} aria-label={t.resetTimer}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d={RESET_ICON} />
              </svg>
            </button>
          )}
        </div>
        {!timerRunning && (
          <div className="timer-options">
            {TIMER_OPTIONS.map(({ seconds, label }) => (
              <button
                key={seconds}
                className={`timer-option ${selectedDuration === seconds ? "active" : ""}`}
                onClick={() => selectDuration(seconds)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <WordDisplay key={lang} lang={lang} onWordCompleted={(word) => setCurrentWord(word)} />

      <div className="center-area">
        {IS_TOUCH ? (
          <input
            ref={inputRef}
            className={`typed-text typed-input ${gameOver ? "disabled" : ""}`}
            type="text"
            value={typedText}
            onChange={handlePhoneInput}
            onKeyDown={handlePhoneKeyDown}
            readOnly={gameOver}
            placeholder={timerRunning ? "" : t.tapToType}
            aria-label={t.typeWord}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="next"
          />
        ) : (
          <div className={`typed-text ${gameOver ? "disabled" : ""}`}>
            {typedText}
            <span className={`cursor ${gameOver ? "hidden" : ""}`} />
          </div>
        )}
      </div>

      {!IS_TOUCH && <Keyboard onKeyPress={handleVirtualKey} activeKey={activeKey} keyStatus={keyStatus} spaceLabel={t.space} />}

      {showBoard && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeBoard()}>
          <div className="modal lb-modal" role="dialog" aria-label={t.leaderboard}>
            <h2>
              <span className="lb-title">
                {t.leaderboard}
                <DeviceBadge lang={lang} className="lb-title-device" />
              </span>
            </h2>
            <Leaderboard duration={selectedDuration} showDurations showDevice={false} lang={lang} />
            <button className="retry-button" onClick={closeBoard}>
              {t.close}
            </button>
          </div>
        </div>
      )}

      {showResults && (
        <div className="modal-overlay">
          <div
            className={`modal ${saved && !isPhone ? "with-board" : ""}${saved && isPhone && boardPage ? " board-page" : ""}`}
          >
            {saved && isPhone && boardPage ? (
              <>
                <div className="board-page-head">
                  <button type="button" className="board-page-button" ref={pageFocusRef} onClick={() => setBoardPage(false)}>
                    <span aria-hidden="true">←</span> {t.results}
                  </button>
                  <button type="button" className="board-page-button board-page-retry" onClick={resetGame}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
                      <path d={RESET_ICON} />
                    </svg>
                    {t.tryAgain}
                  </button>
                </div>
                {savedRank}
                <Leaderboard duration={selectedDuration} initial={saved.top} highlight={saved.name} lang={lang} />
              </>
            ) : (
              <div className="modal-main">
                <div className="score-highlight">
                  <div className="score-label">
                    {t.netWpm}
                    <span
                      className="info-icon"
                      onMouseEnter={() => setShowTooltip(true)}
                      onMouseLeave={() => setShowTooltip(false)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d={INFO_ICON} />
                      </svg>
                    </span>
                  </div>
                  <div className="score-value">{formatWpm(final.netWpm10)}</div>
                  {showTooltip && (
                    <div className="tooltip-container">
                      <div className="tooltip">
                        <p>{t.scoreTitle}</p>
                        <ul>
                          {t.scoreRules.map((rule) => (
                            <li key={rule}>{rule}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
                <h2>{t.timesUp}</h2>
                <div className="results">
                  <div className="result-item">
                    <span className="result-label">{t.rawWpm}</span>
                    <span className="result-value">{formatWpm(final.rawWpm10)}</span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t.precision}</span>
                    <span className="result-value">{final.precision}%</span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t.wordsTyped}</span>
                    <span className="result-value">{wordsAttempted}</span>
                  </div>
                  <div className="result-item">
                    <span className="result-label">{t.correctWords}</span>
                    <span className="result-value">{wordsCorrect}</span>
                  </div>
                </div>
                {saved && isPhone ? (
                  <button type="button" className="board-page-button board-page-open" ref={pageFocusRef} onClick={() => setBoardPage(true)}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
                      <path d={TROPHY_ICON} />
                    </svg>
                    {t.leaderboard}
                  </button>
                ) : saved ? (
                  savedRank
                ) : (
                  wordsCorrect > 0 && (
                    <SaveScore
                      lang={lang}
                      token={roundToken}
                      result={counts}
                      onSaved={(data) => {
                        setSaved(data);
                        setBoardPage(true);
                      }}
                    />
                  )
                )}
                <button className="retry-button" onClick={resetGame}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d={RESET_ICON} />
                  </svg>
                  {t.tryAgain}
                </button>
              </div>
            )}
            {saved && !isPhone && (
              <div className="modal-board">
                <Leaderboard duration={selectedDuration} initial={saved.top} highlight={saved.name} lang={lang} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default App;
