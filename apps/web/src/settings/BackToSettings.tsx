import { Anchor } from "@mantine/core";
import { Link } from "react-router";

/** The link at the top of a Settings page, inside the page's own container so it lines up with the page. */
export function BackToSettings() {
  return (
    <Anchor component={Link} to="/settings" display="inline-block">
      ← Settings
    </Anchor>
  );
}
