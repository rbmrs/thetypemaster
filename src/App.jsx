import { useCallback, useEffect, useRef, useState } from "react";
import Keyboard from "./components/Keyboard.jsx";
import Leaderboard from "./components/Leaderboard.jsx";
import SaveScore from "./components/SaveScore.jsx";
import WordDisplay from "./components/WordDisplay.jsx";
import { startRound } from "./leaderboard.js";

const STATS_KEY = "typeMasterStats";
const THEME_KEY = "theme";

const RESET_ICON =
  "M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z";
const INFO_ICON =
  "M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";

const TIMER_OPTIONS = [
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 180, label: "3m" },
];

// Set in index.html: phones and tablets type with their own keyboard app.
const IS_TOUCH = document.documentElement.classList.contains("touch");

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
// only when the round is that best; show it only when it makes the board.
function boardPlaces(rank, score) {
  return [
    ["alltime", "all-time"],
    ["weekly", "this week"],
  ]
    .map(([id, label]) => ({ id, label, r: rank?.[id] }))
    .filter(({ r }) => r && score >= r.best && r.rank <= BOARD_SIZE)
    .map(({ id, label, r }) => ({ id, text: `#${r.rank} ${label}` }));
}

function App() {
  const [typedText, setTypedText] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const [keyStatus, setKeyStatus] = useState("");
  const [wordsAttempted, setWordsAttempted] = useState(0);
  const [wordsCorrect, setWordsCorrect] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [wpm, setWpm] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [currentWord, setCurrentWord] = useState("");
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerRunning, setTimerRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(30);
  // Leaderboard: round token promise (from POST /start), the submit reply,
  // and the standalone board overlay.
  const [roundToken, setRoundToken] = useState(null);
  const [saved, setSaved] = useState(null);
  const [showBoard, setShowBoard] = useState(false);
  // Touch devices only: the real input that opens the phone's keyboard.
  const inputRef = useRef(null);

  // Clear the on-screen key highlight shortly after each press.
  useEffect(() => {
    if (!activeKey) return;
    const t = setTimeout(() => {
      setActiveKey("");
      setKeyStatus("");
    }, 300);
    return () => clearTimeout(t);
  }, [activeKey]);

  useEffect(() => {
    const saved = localStorage.getItem(STATS_KEY);
    if (saved) {
      const { wordsAttempted, wordsCorrect, wpm, accuracy } = JSON.parse(saved);
      setWordsAttempted(wordsAttempted || 0);
      setWordsCorrect(wordsCorrect || 0);
      setWpm(wpm || 0);
      setAccuracy(accuracy || 100);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STATS_KEY,
      JSON.stringify({ wordsAttempted, wordsCorrect, wpm, accuracy }),
    );
  }, [wordsAttempted, wordsCorrect, wpm, accuracy]);

  useEffect(() => {
    if (startTime && wordsAttempted > 0) {
      // Final WPM counts the full round. Live WPM uses at least 5 s so the first word doesn't spike.
      const seconds = gameOver ? selectedDuration : Math.max((Date.now() - startTime) / 1000, 5);
      setWpm(Math.round(wordsCorrect / (seconds / 60)));
      setAccuracy(Math.round((wordsCorrect / wordsAttempted) * 100));
    }
  }, [wordsAttempted, wordsCorrect, startTime, gameOver, selectedDuration]);

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

  const resetGame = () => {
    setTypedText("");
    setWordsAttempted(0);
    setWordsCorrect(0);
    setStartTime(null);
    setTimeLeft(selectedDuration);
    setTimerRunning(false);
    setGameOver(false);
    setShowResults(false);
    setScore(0);
    setRoundToken(null);
    setSaved(null);
    if (typeof window.advanceWords === "function") {
      for (let i = 0; i < 7; i++) window.advanceWords();
    }
    focusPhoneInput();
  };

  // `pos`, `started` and `word` let the phone input apply several keys from one event.
  const typeLetter = (letter, pos = typedText.length, started = Boolean(startTime), word = currentWord) => {
    const isCorrect = word[pos]?.toLowerCase() === letter;
    setScore(isCorrect ? (s) => s + 1 : (s) => Math.max(0, s - 1));
    setTypedText((t) => t + letter);
    setActiveKey(letter);
    setKeyStatus(isCorrect ? "correct" : "incorrect");
    if (!started) {
      setStartTime(Date.now());
      setTimerRunning(true);
      // Counts loaded from localStorage belong to an earlier round; start this one at zero.
      setWordsAttempted(0);
      setWordsCorrect(0);
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
      setScore((s) => s + 5);
    } else {
      setScore((s) => Math.max(0, s - 3));
    }
    const typed = text.trim();
    setTypedText("");
    if (typeof window.advanceWords === "function") return window.advanceWords(typed, isCorrect, chain);
    return word;
  };

  const handleKeyDown = useCallback(
    (e) => {
      if (gameOver || showBoard) return;
      if (e.target instanceof HTMLInputElement) return;
      if (/^[a-z]$/i.test(e.key)) {
        typeLetter(e.key.toLowerCase());
      } else if (e.key === "Backspace") {
        backspace();
      } else if (e.key === " " || e.key === "Space" || e.key === "Enter") {
        submitWord();
      }
    },
    [typedText, startTime, currentWord, gameOver, showBoard],
  );

  // Phone keyboard: read the input's new value, not keydown (Android sends
  // "Unidentified"). Replay the change as the same backspaces, letters and
  // Space a desktop player would press, so the score is the same.
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
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <div className="app">
        <h1>Type Master</h1>
        <nav className="site-nav">
          <a href="https://rbmrs.dev/">rbmrs.dev</a>
          {!timerRunning && !showResults && (
            <button type="button" className="nav-button" onClick={() => setShowBoard(true)}>
              Leaderboard
            </button>
          )}
        </nav>
      </div>

      <div className="timer-container">
        <div className="timer-display">
          {formatTime(timeLeft)}
          {timerRunning && (
            <button className="reset-button" onClick={resetGame} aria-label="Reset timer">
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

      <WordDisplay onWordCompleted={(word) => setCurrentWord(word)} />

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
            placeholder={timerRunning ? "" : "Tap to type"}
            aria-label="Type the highlighted word"
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

      {!IS_TOUCH && <Keyboard onKeyPress={handleVirtualKey} activeKey={activeKey} keyStatus={keyStatus} />}

      {showBoard && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeBoard()}>
          <div className="modal lb-modal" role="dialog" aria-label="Leaderboard">
            <h2>Leaderboard</h2>
            <Leaderboard duration={selectedDuration} showDurations />
            <button className="retry-button" onClick={closeBoard}>
              Close
            </button>
          </div>
        </div>
      )}

      {showResults && (
        <div className="modal-overlay">
          <div className={`modal ${saved ? "with-board" : ""}`}>
            <div className="modal-main">
              <div className="score-highlight">
                <div className="score-label">
                  Your Score
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
                <div className="score-value">{score}</div>
                {showTooltip && (
                  <div className="tooltip-container">
                    <div className="tooltip">
                      <p>Score System:</p>
                      <ul>
                        <li>+1 point for each correct letter</li>
                        <li>-1 point for each incorrect letter</li>
                        <li>+5 points for each correct word</li>
                        <li>-3 points for each incorrect word</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              <h2>Time's Up!</h2>
              <div className="results">
                <div className="result-item">
                  <span className="result-label">Words Per Minute:</span>
                  <span className="result-value">{wpm}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Accuracy:</span>
                  <span className="result-value">{accuracy}%</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Words Typed:</span>
                  <span className="result-value">{wordsAttempted}</span>
                </div>
                <div className="result-item">
                  <span className="result-label">Correct Words:</span>
                  <span className="result-value">{wordsCorrect}</span>
                </div>
              </div>
              {saved ? (
                <p className="lb-rank">
                  Saved as <strong>{saved.name}</strong>
                  {boardPlaces(saved.rank, score).map(({ id, text }) => (
                    <span key={id} className="lb-place">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true">
                        <path d={TROPHY_ICON} />
                      </svg>
                      {text}
                    </span>
                  ))}
                </p>
              ) : (
                wordsCorrect > 0 && (
                  <SaveScore
                    token={roundToken}
                    result={{ score, wpm, accuracy, wordsTyped: wordsAttempted, wordsCorrect }}
                    onSaved={setSaved}
                  />
                )
              )}
              <button className="retry-button" onClick={resetGame}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d={RESET_ICON} />
                </svg>
                Try Again
              </button>
            </div>
            {saved && (
              <div className="modal-board">
                <Leaderboard duration={selectedDuration} initial={saved.top} highlight={saved.name} />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default App;
