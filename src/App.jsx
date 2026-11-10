import { useCallback, useEffect, useState } from "react";
import Keyboard from "./components/Keyboard.jsx";
import WordDisplay from "./components/WordDisplay.jsx";

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

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

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
      const minutes = (Date.now() - startTime) / 60000;
      setWpm(Math.round(wordsCorrect / (minutes || 1 / 60)));
      setAccuracy(Math.round((wordsCorrect / wordsAttempted) * 100));
    }
  }, [wordsAttempted, wordsCorrect, startTime]);

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
    if (typeof window.advanceWords === "function") {
      for (let i = 0; i < 7; i++) window.advanceWords();
    }
  };

  const typeLetter = (letter) => {
    const isCorrect = currentWord[typedText.length]?.toLowerCase() === letter;
    setScore(isCorrect ? (s) => s + 1 : (s) => Math.max(0, s - 1));
    setTypedText((t) => t + letter);
    setActiveKey(letter);
    setKeyStatus(isCorrect ? "correct" : "incorrect");
    if (!startTime) {
      setStartTime(Date.now());
      setTimerRunning(true);
    }
  };

  const backspace = () => {
    setTypedText((t) => t.slice(0, -1));
    setActiveKey("Backspace");
    setKeyStatus("");
  };

  const submitWord = () => {
    setWordsAttempted((n) => n + 1);
    if (typedText.trim() === "") return;
    const isCorrect = typedText.trim().toLowerCase() === currentWord.toLowerCase();
    if (isCorrect) {
      setWordsCorrect((n) => n + 1);
      setScore((s) => s + 5);
    } else {
      setScore((s) => Math.max(0, s - 3));
    }
    const typed = typedText.trim();
    setTypedText("");
    if (typeof window.advanceWords === "function") window.advanceWords(typed, isCorrect);
  };

  const handleKeyDown = useCallback(
    (e) => {
      if (gameOver) return;
      if (/^[a-z]$/i.test(e.key)) {
        typeLetter(e.key.toLowerCase());
      } else if (e.key === "Backspace") {
        backspace();
      } else if (e.key === " " || e.key === "Space" || e.key === "Enter") {
        submitWord();
      }
    },
    [typedText, startTime, currentWord, gameOver],
  );

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
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <div className="app">
        <h1>Type Master</h1>
        <nav className="site-nav">
          <a href="https://rbmrs.dev/">rbmrs.dev</a>
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
        <div className={`typed-text ${gameOver ? "disabled" : ""}`}>
          {typedText}
          <span className={`cursor ${gameOver ? "hidden" : ""}`} />
        </div>
      </div>

      <Keyboard onKeyPress={handleVirtualKey} activeKey={activeKey} keyStatus={keyStatus} />

      {showResults && (
        <div className="modal-overlay">
          <div className="modal">
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
            <button className="retry-button" onClick={resetGame}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d={RESET_ICON} />
              </svg>
              Try Again
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
