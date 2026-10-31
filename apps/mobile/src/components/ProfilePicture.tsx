import { Image, StyleSheet, View } from "react-native";
import { apiUrl } from "../config";
import type { User } from "../session/client";
import { useTheme } from "../theme";
import { Text } from "./Text";

/** The User's picture, or their initials on orange when they show none (as on the web). */
export function ProfilePicture({ user, size }: { user: User; size: number }) {
  const theme = useTheme();
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (user.avatarUrl) {
    // Uploaded pictures are served by the API at a relative address; providers' pictures are absolute.
    const uri = user.avatarUrl.startsWith("/") ? apiUrl + user.avatarUrl : user.avatarUrl;
    return <Image source={{ uri }} style={box} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[styles.initials, box, { backgroundColor: theme.colorAccent }]}>
      <Text weight="bold" size={size * 0.38} style={{ color: theme.onAccent }}>
        {initials(user.displayName)}
      </Text>
    </View>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters =
    parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : name.slice(0, 2);
  return letters.toUpperCase();
}

const styles = StyleSheet.create({
  initials: { alignItems: "center", justifyContent: "center" },
});
