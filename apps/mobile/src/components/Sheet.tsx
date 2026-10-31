import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * A bottom sheet for confirmations, such as "Sign out?". It slides up over a dimmed screen; tapping the dimmed part or
 * the phone's back button closes it.
 */
export function Sheet({ open, onClose, children }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
          accessibilityLabel="Close"
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: theme.modalBg, paddingBottom: 24 + insets.bottom },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.lineStrong }]} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingTop: 12,
    gap: 12,
  },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginBottom: 8 },
});
