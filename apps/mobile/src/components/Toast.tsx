import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

/** How long a toast stays before it goes by itself. */
const SHOWN_MS = 5000;

// The design's pill, dark in every theme as the web's toasts are.
const PILL = { background: "#262321", text: "#f4f2ef", border: "rgba(255, 255, 255, 0.08)" };

/**
 * Shown once when it mounts: give it a new `key` to show it again.
 *
 * A dark pill near the bottom of the screen, for news such as "Password updated" (design M4f). Its tick is the
 * tokens' green for done, not the design's orange, which means "selected".
 */
export function Toast({ message }: { message: string }) {
  const theme = useTheme();
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShown(false), SHOWN_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!shown) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.toast, { backgroundColor: PILL.background, borderColor: PILL.border }]}
    >
      <View style={[styles.mark, { backgroundColor: theme.toastSuccess }]}>
        <Text weight="bold" style={{ color: theme.toastSuccessFg }}>
          ✓
        </Text>
      </View>
      <Text size={14} style={[styles.text, { color: PILL.text }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  text: { flex: 1 },
});
