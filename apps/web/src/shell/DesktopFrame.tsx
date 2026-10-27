import { useNimbusTheme } from "@repo/ui/nimbus-theme";
import { useEffect, useLayoutEffect } from "react";
import { nimbusDesktop } from "./desktop";
import "./desktopFrame.css";

/**
 * What the Desktop app's window needs on every page, signed in or not (nothing in a browser):
 *
 * - The page's light or dark theme goes to the window, so its own buttons (Windows) match it.
 * - The window has no title bar of its own (apps/desktop/src/chrome.js). Inside DesktopShell the Sidebar and the title
 *   row are the frame; on every other page (Login, Register, the session check, Session expired) a strip across the
 *   top is the drag area and the page starts below it, clear of the traffic lights or the Windows buttons. Linux keeps
 *   its native frame and gets no strip.
 *
 * `data-desktop` on the root element names the platform for the stylesheet (desktopFrame.css).
 */
export function DesktopFrame() {
  const desktop = nimbusDesktop();
  const { mode } = useNimbusTheme();

  useEffect(() => {
    desktop?.setTheme(mode);
  }, [desktop, mode]);

  // Before the first paint, so the page doesn't jump down under the strip.
  useLayoutEffect(() => {
    if (!desktop) return;
    const root = document.documentElement;
    root.dataset.desktop = desktop.platform;
    return () => {
      delete root.dataset.desktop;
    };
  }, [desktop]);

  if (!desktop) return null;
  return <div className="nimbus-window-frame" aria-hidden />;
}
