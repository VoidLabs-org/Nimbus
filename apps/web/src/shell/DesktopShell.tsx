import { Container, Tooltip, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Glyph } from "@repo/ui/glyph";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { UserMenu } from "../auth/UserMenu";
import { useSession } from "../auth/useSession";
import { PageContent } from "./AppShell";
import { useSettingsOverlay } from "../settings/settingsOverlay";
import {
  desktopPlatform,
  isSettingsShortcut,
  modifierLabel,
  nimbusDesktop,
  type NimbusDesktop,
} from "./desktop";
import classes from "./DesktopShell.module.css";
import { TabRow } from "./TabRow";
import { DESTINATIONS, type Destination } from "./navigation";
import { NimbusLogo } from "./NimbusLogo";
import { AUTO_FOLD_QUERY, isFoldShortcut, useSidebarState } from "./sidebarState";
import { TabTitleContext } from "./tabTitle";
import { useTabShortcuts, useTabs } from "./useTabs";

type Platform = NimbusDesktop["platform"];

/**
 * Ctrl or ⌘ \ folds or opens the Sidebar, as the fold button does. The listener is added once; it always calls the
 * latest `toggle`.
 */
function useFoldShortcut(platform: Platform, toggle: () => void) {
  const onShortcut = useEffectEvent(toggle);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isFoldShortcut(event, platform)) return;
      event.preventDefault();
      onShortcut();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [platform]);
}

/** A link in the open Sidebar: icon and name, filled while its page is open (Settings on every page under it). */
function SidebarRow({
  destination,
  active = false,
  keyShortcuts,
}: {
  destination: Destination;
  /** Highlighted whatever the address says (Settings, while its overlay is open over the page). */
  active?: boolean;
  /** The row's keyboard shortcut, for screen readers (aria-keyshortcuts); not shown. */
  keyShortcuts?: string;
}) {
  return (
    <NavLink
      to={destination.to}
      end={destination.end}
      data-active={active || undefined}
      aria-keyshortcuts={keyShortcuts}
      className={({ isActive }) =>
        isActive || active ? `${classes.row} ${classes.active}` : classes.row
      }
    >
      <span className={classes.rowIcon}>
        <Glyph icon={destination.icon} size={18} />
      </span>
      {destination.label}
    </NavLink>
  );
}

/**
 * Ctrl or ⌘ , opens Settings, in its overlay, from anywhere. While Settings is open it does nothing, so the page open
 * in it (a Role being edited) stays.
 */
function useSettingsShortcut(platform: Platform, settingsOpen: boolean) {
  const navigate = useNavigate();
  const open = useEffectEvent(() => {
    if (!settingsOpen) navigate(SETTINGS.to);
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isSettingsShortcut(event, platform)) return;
      event.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [platform]);
}

/**
 * The Nimbus icon at the top left on Windows and Linux, which show no menu bar: it pops the app menu (Edit, View,
 * Window) up under itself, as Notion's icon does. macOS has the menu bar, so it has no icon.
 */
function AppMenuButton() {
  return (
    <Tooltip label="Menu" position="bottom-start" withArrow>
      <UnstyledButton
        className={classes.appMenuButton}
        aria-label="Nimbus menu"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          nimbusDesktop()?.showAppMenu(box.left, box.bottom + 4);
        }}
      >
        <NimbusLogo size={18} />
      </UnstyledButton>
    </Tooltip>
  );
}

/**
 * Settings, at the bottom of the Sidebar with the account, apart from the pages people work in. It opens in the Settings
 * overlay over the page (see AppRoutes).
 */
const SETTINGS = DESTINATIONS.find((destination) => destination.id === "settings")!;

/** How long the pointer rests on the Sidebar button, while folded, before the Sidebar peeks out. */
export const PEEK_DELAY_MS = 300;

/**
 * The Sidebar button: folds the open Sidebar away or opens it again; its tooltip names the shortcut. It stays in one
 * place at the top left of the window whether the Sidebar is open or folded, so it is where the pointer left it. While
 * folded, resting the pointer on it peeks the Sidebar out over the page.
 */
function FoldButton({
  folded,
  platform,
  onClick,
  onPointerIn,
  onPointerOut,
}: {
  folded: boolean;
  platform: Platform;
  onClick: () => void;
  onPointerIn: () => void;
  onPointerOut: (event: React.MouseEvent) => void;
}) {
  const label = folded ? "Open the Sidebar" : "Fold the Sidebar";
  return (
    <Tooltip label={`${label} (${modifierLabel(platform)} \\)`} position="bottom-start" withArrow>
      <UnstyledButton
        className={classes.foldButton}
        onClick={onClick}
        onMouseEnter={onPointerIn}
        onMouseLeave={onPointerOut}
        aria-label={label}
        aria-expanded={!folded}
      >
        <Glyph
          icon={folded ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse}
          size={18}
        />
      </UnstyledButton>
    </Tooltip>
  );
}

/**
 * The Desktop app's shell for every signed-in page (the browser gets AppShell's navbar instead), laid out like the
 * Claude app: the Sidebar down the left, and beside it a title row (the Tabs, see useTabs; the window's own
 * buttons at its right on Windows) over the page. The Sidebar and the title row are the window's frame, in the theme's surface colour, and
 * the window is dragged by their top 46px; the page shows the theme's background, so it stands apart.
 *
 * There is no brand row, as in other desktop apps: on Windows and Linux the Nimbus icon at the top left opens the app
 * menu instead. The Sidebar (Home and Projects at the top; Settings, which lists its own pages, and the account at the
 * bottom, so the account menu opens upwards into free room) is open or folded away completely, giving the page the whole width; the Sidebar button at the top left and Ctrl or ⌘ \ switch between
 * them. The choice is kept on this computer. While folded, resting the pointer on the button peeks the Sidebar out
 * over the page, without opening it for good; it goes again when the pointer moves onto the page, on Esc, or when a
 * page is opened from it. Under 960px wide the Sidebar folds itself without changing the choice, and the button or
 * shortcut opens it until the window is widened again.
 */
export default function DesktopShell() {
  const platform = desktopPlatform();
  const location = useLocation();
  // Starts the request (and caches it) on every signed-in page, so Settings lists its groups at once.
  usePlatformPermissions();
  const [chosen, setChosen] = useSidebarState();
  const narrow = useMediaQuery(AUTO_FOLD_QUERY, false, { getInitialValueInEffect: false });
  const [openWhileNarrow, setOpenWhileNarrow] = useState(false);
  // Opening it in a narrow window lasts until the window is widened; narrowing again folds it again.
  if (!narrow && openWhileNarrow) setOpenWhileNarrow(false);
  const folded = narrow ? !openWhileNarrow : chosen === "folded";
  const settingsOpen = useSettingsOverlay() === "behind";
  useSettingsShortcut(platform, settingsOpen);
  // RequireUser only shows the shell to a signed-in User.
  const userId = useSession().user!.id;
  const tabs = useTabs(userId, settingsOpen);
  useTabShortcuts(platform, settingsOpen, tabs);

  // Peeking holds the page it started on, so opening another page from the Sidebar ends it.
  const [peekedAt, setPeekedAt] = useState<string | null>(null);
  // Opening Settings from a peeking Sidebar ends it too: the page behind the overlay, which the peek holds, stays.
  if (settingsOpen && peekedAt !== null) setPeekedAt(null);
  const peeking = folded && peekedAt === location.key;
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Opening or folding for good ends any peek, and one about to start: folding again must hide the Sidebar, not peek it.
  const toggle = () => {
    clearTimeout(peekTimer.current);
    setPeekedAt(null);
    if (narrow) setOpenWhileNarrow(!openWhileNarrow);
    else setChosen(folded ? "open" : "folded");
  };
  useFoldShortcut(platform, toggle);
  const mainRef = useRef<HTMLDivElement>(null);
  const startPeek = () => {
    if (!folded) return;
    clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeekedAt(location.key), PEEK_DELAY_MS);
  };
  // Ends the peek once the pointer is over the page; moving between the button and the Sidebar, or into the account
  // menu (drawn outside both), keeps it.
  const endPeekOnPage = (event: React.MouseEvent) => {
    clearTimeout(peekTimer.current);
    const to = event.relatedTarget;
    if (to instanceof Node && mainRef.current?.contains(to)) setPeekedAt(null);
  };
  useEffect(() => () => clearTimeout(peekTimer.current), []);
  useEffect(() => {
    if (!peeking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPeekedAt(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [peeking]);

  return (
    <div
      className={classes.shell}
      data-desktop-shell
      data-platform={platform}
      data-folded={folded || undefined}
    >
      {(!folded || peeking) && (
        <nav
          className={classes.sidebar}
          aria-label="Main"
          data-peek={peeking || undefined}
          onMouseLeave={endPeekOnPage}
        >
          {/* Dragged by, like the title row; macOS draws its traffic lights at its left end, the button sits over it. */}
          <div className={classes.sidebarTop} />
          <div className={classes.open}>
            {DESTINATIONS.filter((destination) => destination.id !== "settings").map(
              (destination) => (
                <SidebarRow key={destination.id} destination={destination} />
              ),
            )}
            <div className={classes.bottom}>
              <SidebarRow
                destination={SETTINGS}
                active={settingsOpen}
                keyShortcuts={platform === "darwin" ? "Meta+Comma" : "Control+Comma"}
              />
              <div className={classes.account}>
                <UserMenu variant="sidebar" placement="top-start" offset={8} />
                {/* The Notification bell goes here once Notifications exist. */}
                <div className={classes.bellSlot} data-slot="bell" />
              </div>
            </div>
          </div>
        </nav>
      )}
      <div className={classes.main} ref={mainRef}>
        {/* The window is dragged by this row, but for its Tabs. */}
        <div className={classes.titleRow}>
          <TabRow tabs={tabs.tabs} onClose={tabs.close} />
        </div>
        <div className={classes.content}>
          <Container size="lg">
            <TabTitleContext value={tabs.name}>
              <PageContent />
            </TabTitleContext>
          </Container>
        </div>
      </div>
      {/* Last, on purpose: Electron applies drag and no-drag areas in page order, so a drag row after these buttons
          would take their clicks. */}
      {platform !== "darwin" && <AppMenuButton />}
      <FoldButton
        folded={folded}
        platform={platform}
        onClick={toggle}
        onPointerIn={startPeek}
        onPointerOut={endPeekOnPage}
      />
    </div>
  );
}
