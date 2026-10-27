import { useMediaQuery } from "@mantine/hooks";
import { NimbusToasts } from "@repo/ui/toast";
import { isDesktop } from "./desktop";
import {
  effectivePosition,
  NARROW_QUERY,
  notificationPosition,
  useNavPosition,
} from "./navPosition";

/**
 * Toasts, in a corner the navbar isn't on (the account chip sits at the end of the bar, so a toast must not cover it).
 * The Desktop app has no navbar, only the Sidebar on the left, so they go bottom right there.
 */
export function AppNotifications() {
  const [chosen] = useNavPosition();
  const narrow = useMediaQuery(NARROW_QUERY, false, { getInitialValueInEffect: false });
  const position = isDesktop() ? "top" : effectivePosition(chosen, narrow);
  return <NimbusToasts position={notificationPosition(position)} />;
}
