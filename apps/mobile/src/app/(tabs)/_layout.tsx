import { type Href, router, Tabs } from "expo-router";
import { useEffect } from "react";
import type { ColorValue } from "react-native";
import { Text } from "../../components/Text";
import { useSession } from "../../session/session";
import { fonts, useTheme } from "../../theme";

/** Home, Inbox and Settings, the signed-in app (design M3d). */
export default function TabsLayout() {
  const theme = useTheme();
  const { takeReturnTo } = useSession();

  // After "Your session expired" and signing in again, back to the screen the User was on.
  useEffect(() => {
    const returnTo = takeReturnTo();
    if (returnTo && returnTo !== "/") router.replace(returnTo as Href);
  }, [takeReturnTo]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colorText,
        tabBarInactiveTintColor: theme.colorAccent2500,
        tabBarStyle: { backgroundColor: theme.colorBg, borderTopColor: theme.line },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        sceneStyle: { backgroundColor: theme.colorBg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color }) => <TabIcon symbol="⌂" color={color} /> }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color }) => <TabIcon symbol="◔" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => <TabIcon symbol="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}

/** The design's tab glyphs, in the tab's colour. */
function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return (
    <Text size={20} style={{ color }}>
      {symbol}
    </Text>
  );
}
