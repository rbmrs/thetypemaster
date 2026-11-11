import { useEffect, useId, useRef, useState } from "react";
import { strings } from "../i18n.js";

const INFO_ICON =
  "M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";

// The score on the results card, with an (i) button that shows how the score
// works. The popup opens on mouse hover, keyboard focus or a tap:
// - mouse: hover opens it, leaving closes it (a click does nothing more);
// - touch: a tap toggles it; a tap outside closes it;
// - keyboard: focus shows it, Enter or Space toggles it, Escape or blur closes it.
// The popup stays in the DOM (hidden), so aria-describedby always works.
const ScoreHighlight = ({ lang, score }) => {
  const t = strings(lang);
  const id = useId();
  const popupId = `${id}-score-popup`;
  const buttonRef = useRef(null);
  // Why it is open: the mouse is over it, keyboard focus is on it, or a tap / key pinned it.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  // The pointer type of the press that leads to the next click.
  const pressRef = useRef("");
  const open = hovered || focused || pinned;

  const close = () => {
    setHovered(false);
    setFocused(false);
    setPinned(false);
  };

  // Escape closes; a press outside the button closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && close();
    const onPointer = (e) => {
      if (!buttonRef.current?.contains(e.target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // Pointer events tell mouse from touch, so a tap's synthetic mouseleave
  // doesn't close the popup right after it opens.
  const onPointerEnter = (e) => e.pointerType === "mouse" && setHovered(true);
  const onPointerLeave = (e) => e.pointerType === "mouse" && setHovered(false);
  const onPointerDown = (e) => {
    pressRef.current = e.pointerType;
  };
  const onClick = (e) => {
    const press = pressRef.current;
    pressRef.current = "";
    // Hover already shows it for the mouse.
    if (press === "mouse") return;
    // A tap on the open popup closes it on pointerdown; the browser then
    // sends that tap's click to the button under it. That press did not
    // start on the button, so drop the click. Keys send detail 0.
    if (e.detail > 0 && !press) return;
    if (open) close();
    else setPinned(true);
  };
  // Only keyboard focus shows it. A tap also focuses the button, and the
  // tap's click toggles it.
  const onFocus = (e) => e.currentTarget.matches(":focus-visible") && setFocused(true);
  const onBlur = () => {
    setFocused(false);
    setPinned(false);
  };

  return (
    <div className="score-highlight">
      {/* The label stays for screen readers; the number speaks for itself. */}
      <div className="score-label visually-hidden">{t.netCpm}</div>
      <div className="score-value">
        <span className="score-number">
          {score}
          <button
            type="button"
            ref={buttonRef}
            className="info-icon score-info"
            aria-label={t.scoreInfo}
            aria-expanded={open}
            aria-controls={popupId}
            aria-describedby={popupId}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            onPointerDown={onPointerDown}
            onClick={onClick}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d={INFO_ICON} />
            </svg>
          </button>
        </span>
      </div>
      <div className="tooltip-container" hidden={!open}>
        <div className="tooltip" id={popupId}>
          <p>{t.scoreTitle}</p>
          <ul>
            {t.scoreRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ScoreHighlight;
