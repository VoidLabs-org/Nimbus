import { StyleSheet, View } from "react-native";
import { Screen } from "../../components/Screen";
import { Text } from "../../components/Text";

/** The Notifications inbox comes with #208. */
export default function Inbox() {
  return (
    <Screen>
      <View style={styles.text}>
        <Text weight="semibold" size={28} accessibilityRole="header">
          Inbox
        </Text>
        <Text muted>Your Notifications will show here soon. For now, see them on the web.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { marginTop: 16, gap: 6 },
});
