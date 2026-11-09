import { useEffect } from "react";

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

const Keyboard = ({ onKeyPress, activeKey, keyStatus = "" }) => {
  useEffect(() => {
    const handleResize = () => {
      const container = document.querySelector(".keyboard-container");
      if (!container) return;
      const width = window.innerWidth;
      container.style.fontSize = width < 500 ? "0.8em" : width < 800 ? "0.9em" : "1em";
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const keyClass = (key) => {
    if (key !== activeKey) return "key-button";
    if (keyStatus === "incorrect") return "key-button key-incorrect";
    return "key-button key-active";
  };

  return (
    <div className="keyboard-container">
      {ROWS.map((row, rowIndex) => (
        <div className="keyboard-row" key={rowIndex}>
          {row.split("").map((key) => (
            <button key={key} className={keyClass(key)} onClick={() => onKeyPress(key)}>
              {key}
            </button>
          ))}
          {rowIndex === 0 && (
            <button
              className={`key-button key-backspace ${activeKey === "Backspace" ? "key-backspace-active" : ""}`}
              onClick={() => onKeyPress("Backspace")}
            >
              ←
            </button>
          )}
        </div>
      ))}
      <div className="keyboard-row" style={{ display: "flex", justifyContent: "center" }}>
        <button
          className={`key-button key-space ${activeKey === " " ? "key-active" : ""}`}
          onClick={() => onKeyPress(" ")}
        >
          Space
        </button>
      </div>
    </div>
  );
};

export default Keyboard;
