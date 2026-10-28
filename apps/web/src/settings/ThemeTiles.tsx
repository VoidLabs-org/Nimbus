import { useNimbusTheme } from "@repo/ui/nimbus-theme";
import { useRef } from "react";
import classes from "./ThemeTiles.module.css";

type Choice = "paper" | "ink" | "system";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "paper", label: "Paper" },
  { value: "ink", label: "Ink" },
  { value: "system", label: "System" },
];

/**
 * The Desktop app's theme picker (design "Nimbus Desktop v2", Settings → Appearance): a tile per choice with a preview
 * of its page colour, the chosen one ringed. Only the flat themes: the glass ones (Fog, Slate) don't suit a window, and
 * the Desktop app shows them flat anyway. System follows the computer's light or dark setting. A radio group: Tab
 * reaches the chosen tile, the arrow keys move between them.
 */
export function ThemeTiles() {
  const { theme, followsSystem, setTheme, followSystem } = useNimbusTheme();
  // Shown flat in the Desktop app, a saved glass theme counts as its flat twin.
  const flat: Choice = theme === "ink" || theme === "slate" ? "ink" : "paper";
  const chosen: Choice = followsSystem ? "system" : flat;
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (value: Choice) => {
    if (value === "system") followSystem();
    else setTheme(value);
  };
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + CHOICES.length) % CHOICES.length;
    choose(CHOICES[next]!.value);
    tiles.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Theme" className={classes.tiles}>
      {CHOICES.map(({ value, label }, index) => (
        <button
          key={value}
          ref={(element) => {
            tiles.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={value === chosen}
          tabIndex={value === chosen ? 0 : -1}
          className={classes.tile}
          onClick={() => choose(value)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <span className={classes.preview} data-swatch={value} aria-hidden />
          <span className={classes.label}>{label}</span>
        </button>
      ))}
    </div>
  );
}
