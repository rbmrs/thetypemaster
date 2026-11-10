import { useEffect, useRef, useState } from "react";
import { randomWord } from "../words.js";

// Index of the word the user is typing. Earlier slots show history;
// "debug1" placeholders are hidden by CSS until real words fill them.
const CURRENT = 3;

const WordDisplay = ({ onWordCompleted }) => {
  const [words, setWords] = useState([
    { text: "debug1" },
    { text: "debug1" },
    { text: "debug1" },
    { text: randomWord() },
    { text: randomWord() },
    { text: randomWord() },
    { text: randomWord() },
  ]);

  // Words after the last advance, until React renders them. Only `chain`
  // calls (the phone input submitting two words in one event) build on it;
  // other calls, like the 7 in a reset, keep their old behaviour.
  const pending = useRef(null);
  useEffect(() => {
    pending.current = null;
  }, [words]);

  // Returns the new current word.
  const advanceWords = (typed, isCorrect, chain = false) => {
    const updated = [...(chain && pending.current ? pending.current : words)];
    if (typed) updated[CURRENT] = { ...updated[CURRENT], typed, isCorrect };
    const next = [...updated.slice(1), { text: randomWord() }];
    pending.current = next;
    setWords(next);
    onWordCompleted?.(next[CURRENT].text);
    return next[CURRENT].text;
  };

  // App drives word advancement through this global.
  useEffect(() => {
    window.advanceWords = advanceWords;
    return () => {
      delete window.advanceWords;
    };
  }, [words]);

  useEffect(() => {
    onWordCompleted?.(words[CURRENT].text);
  }, []);

  return (
    <div className="words-window">
      <div
        className="words-container"
        style={{ display: "flex", justifyContent: "center", width: "100%", margin: "0 auto" }}
      >
        {words.map((word, index) => {
          let className = "word";
          if (index === CURRENT) className += " current";
          if (word.text === "debug1") className += " debug";
          if (word.typed && word.isCorrect !== undefined)
            className += word.isCorrect ? " correct" : " incorrect";
          return (
            <div key={`${word.text}-${index}`} className={className}>
              {word.typed || word.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WordDisplay;
