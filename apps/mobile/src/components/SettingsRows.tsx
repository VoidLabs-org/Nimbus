import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

/** A rounded card of rows, divided by thin lines (designs M3h, M7a). */
export function SettingsGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.group, { backgroundColor: theme.card }]}>{children}</View>;
}

type RowProps = {
  title: string;
  /** The current value under the title, such as the display name. */
  detail?: string;
  /** A small pill after the detail, such as "Verified". */
  badge?: string;
  onPress: () => void;
  /** Draws the line above it: every row but a group's first. */
  divided?: boolean;
};

/** A row that opens what it names; its accessible name is the title, then the detail. */
export function SettingsRow({ title, detail, badge, onPress, divided = false }: RowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, detail].filter(Boolean).join(", ")}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divided && [styles.divided, { borderTopColor: theme.line }],
        pressed && { backgroundColor: theme.seg },
      ]}
    >
      <View style={styles.text}>
        <Text weight="medium" size={16}>
          {title}
        </Text>
        {detail ? (
          <View style={styles.detail}>
            <Text muted size={13} numberOfLines={1} style={styles.detailText}>
              {detail}
            </Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: theme.colorAccent100 }]}>
                <Text
                  weight="semibold"
                  size={11}
                  style={{ color: theme.dark ? theme.colorAccent700 : theme.colorAccent800 }}
                >
                  {badge}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <Text muted size={20}>
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 22, overflow: "hidden" },
  row: {
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, marginLeft: 0 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  detail: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { flexShrink: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
});
