import { useMediaQuery } from "@mantine/hooks";
import { NimbusToasts } from "@repo/ui/toast";
import {
  effectivePosition,
  NARROW_QUERY,
  notificationPosition,
  useNavPosition,
} from "./navPosition";

/** Toasts, in a corner the navbar isn't on (the account chip sits at the end of the bar, so a toast must not cover it). */
export function AppNotifications() {
  const [chosen] = useNavPosition();
  const narrow = useMediaQuery(NARROW_QUERY, false, { getInitialValueInEffect: false });
  return <NimbusToasts position={notificationPosition(effectivePosition(chosen, narrow))} />;
}
