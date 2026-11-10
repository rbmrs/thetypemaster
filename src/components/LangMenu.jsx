import { useEffect, useRef } from "react";

// Inline SVG flags: Windows shows flag emoji as two plain letters.
const BrazilFlag = () => (
  <svg className="flag" viewBox="0 0 20 14" aria-hidden="true">
    <rect width="20" height="14" fill="#009c3b" />
    <path d="M10 1.6 18.4 7 10 12.4 1.6 7Z" fill="#ffdf00" />
    <circle cx="10" cy="7" r="3.4" fill="#002776" />
    <path d="M6.7 6.2c2.3-.5 4.7 0 6.6 1.4" stroke="#fff" strokeWidth="0.6" fill="none" />
  </svg>
);

const STRIPES = Array.from({ length: 7 }, (_, i) => i * 2);
const STARS = Array.from({ length: 12 }, (_, i) => [1.4 + (i % 4) * 2.2, 1.3 + Math.floor(i / 4) * 2.4]);
const UsFlag = () => (
  <svg className="flag" viewBox="0 0 20 13" aria-hidden="true">
    <rect width="20" height="13" fill="#fff" />
    {STRIPES.map((i) => (
      <rect key={i} y={i} width="20" height="1" fill="#b22234" />
    ))}
    <rect width="8.6" height="7" fill="#3c3b6e" />
    {STARS.map(([x, y]) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r="0.45" fill="#fff" />
    ))}
  </svg>
);

export const LANGS = [
  { lang: "en", name: "English", Flag: UsFlag },
  { lang: "pt", name: "Português", Flag: BrazilFlag },
];

// Flag button in the top right corner with a small language drop-down.
// App owns `open`, so its key handler can ignore keys while the menu is open.
const LangMenu = ({ lang, onSelect, open, setOpen }) => {
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const current = LANGS.find((l) => l.lang === lang) || LANGS[0];

  // Close on a click outside or on Escape (focus goes back to the flag).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // Start on the chosen language, so keyboard users land in the list.
    rootRef.current?.querySelector('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Up / Down move between the items.
  const onMenuKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...rootRef.current.querySelectorAll('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    items[(i + step + items.length) % items.length]?.focus();
  };

  const pick = (next) => {
    onSelect(next);
    setOpen(false);
    // Drop focus, so the next keys type into the game.
    document.activeElement?.blur?.();
  };

  return (
    <div className="lang-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="lang-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Word language: ${current.name}`}
        title={`Word language: ${current.name}`}
        onClick={() => setOpen(!open)}
      >
        <current.Flag />
        <svg className="lang-caret" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div className="lang-list" role="menu" aria-label="Word language" onKeyDown={onMenuKey}>
          {LANGS.map(({ lang: l, name, Flag }) => (
            <button
              key={l}
              type="button"
              role="menuitemradio"
              aria-checked={l === lang}
              className={`lang-item ${l === lang ? "active" : ""}`}
              onClick={() => pick(l)}
            >
              <Flag />
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LangMenu;
