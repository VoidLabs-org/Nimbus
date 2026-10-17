import { Kbd, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { NARROW_QUERY, NAV_POSITIONS, useNavPosition, type NavPosition } from "./navPosition";
import classes from "./NavPositionPicker.module.css";

const LABELS: Record<NavPosition, string> = {
  top: "Top",
  bottom: "Bottom",
  left: "Left",
  right: "Right",
};

/** The shortcut's modifier keys, as this computer names them. */
const MODIFIERS = /Mac|iPhone|iPad/.test(navigator.userAgent) ? ["⌥", "⇧"] : ["Alt", "Shift"];

/**
 * Where the navbar sits: a card for each edge with a small preview of the bar on it, the chosen one outlined in
 * orange, and the keyboard shortcut for the same choice. A group of native radio buttons, so the arrow keys move between them. On a narrow screen the bar is always
 * at the top, which the note says.
 */
export function NavPositionPicker() {
  const [position, setPosition] = useNavPosition();
  const narrow = useMediaQuery(NARROW_QUERY, false, { getInitialValueInEffect: false });
  return (
    <fieldset className={classes.fieldset}>
      <legend className={classes.legend}>Navbar position</legend>
      <div className={classes.cards}>
        {NAV_POSITIONS.map((edge) => (
          <label key={edge} className={classes.card} data-checked={edge === position || undefined}>
            <input
              type="radio"
              name="navbar-position"
              className={classes.input}
              value={edge}
              checked={edge === position}
              onChange={() => setPosition(edge)}
            />
            <span className={classes.preview} data-edge={edge} aria-hidden>
              <span className={classes.mark} />
            </span>
            <span className={classes.label}>{LABELS[edge]}</span>
          </label>
        ))}
      </div>
      <Text size="sm" c="dimmed" mt="sm">
        Shortcut: <Kbd>{MODIFIERS[0]}</Kbd> + <Kbd>{MODIFIERS[1]}</Kbd> + an arrow key, pointing at
        the edge (<Kbd>↑</Kbd> top, <Kbd>↓</Kbd> bottom, <Kbd>←</Kbd> left, <Kbd>→</Kbd> right).
      </Text>
      {narrow && (
        <Text size="sm" c="dimmed" mt="sm">
          On a narrow screen the navbar is always at the top, whichever you choose.
        </Text>
      )}
    </fieldset>
  );
}
