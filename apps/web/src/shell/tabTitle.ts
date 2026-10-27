import { createContext, use, useEffect } from "react";
import { useLocation } from "react-router";
import { tabTitle, type Crumb } from "./crumbs";

/**
 * How a page names its Tab in the Desktop app: DesktopShell provides it; elsewhere (a browser, the Settings overlay)
 * there is none. Kept out of the shell's chunk, since every page's breadcrumb uses it.
 */
export const TabTitleContext = createContext<((path: string, title: string) => void) | null>(null);

/** Names the page's Tab after its breadcrumb, once the breadcrumb has its name. */
export function useTabTitle(crumbs: Crumb[]) {
  const nameTab = use(TabTitleContext);
  const { pathname } = useLocation();
  const title = tabTitle(crumbs);
  useEffect(() => {
    if (nameTab && title) nameTab(pathname, title);
  }, [nameTab, pathname, title]);
}
