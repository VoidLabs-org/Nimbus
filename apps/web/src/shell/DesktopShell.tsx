import { Container, Tooltip, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Glyph } from "@repo/ui/glyph";
import { useNimbusTheme } from "@repo/ui/nimbus-theme";
import {
  IconFolderPlus,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  IconSearch,
  IconSettings,
  IconSunMoon,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { usePlatformPermissions } from "../access/usePlatformPermissions";
import { SignOutDialog } from "../auth/SignOutDialog";
import { UserMenu } from "../auth/UserMenu";
import { useSession } from "../auth/useSession";
import { PageContent } from "./AppShell";
import { useSettingsGroups } from "../settings/sections";
import { isSettingsPath, useSettingsOverlay } from "../settings/settingsOverlay";
import {
  desktopPlatform,
  isSettingsShortcut,
  ariaShortcut,
  shortcutLabel,
  nimbusDesktop,
  type NimbusDesktop,
} from "./desktop";
import classes from "./DesktopShell.module.css";
import { ContextMenu, type ContextMenuState } from "./ContextMenu";
import { Jump } from "./Jump";
import { isJumpShortcut, jumpPages, type JumpAction, type JumpItem } from "./jumpTargets";
import { TabRow } from "./TabRow";
import { DESTINATIONS, type Destination } from "./navigation";
import { NimbusLogo } from "./NimbusLogo";
import { AUTO_FOLD_QUERY, isFoldShortcut, useSidebarState } from "./sidebarState";
import { TabTitleContext } from "./tabTitle";
import { linkMenu, tabMenu } from "./tabMenus";
import { useNewTabClicks, useTabShortcuts, useTabs, type TabActions } from "./useTabs";
import { useShortcut } from "./useShortcut";

type Platform = NimbusDesktop["platform"];

/** A link in the open Sidebar: icon and name, filled while its page is open (Settings on every page under it). */
function SidebarRow({
  destination,
  active = false,
  keyShortcuts,
  onMenu,
}: {
  destination: Destination;
  /** Highlighted whatever the address says (Settings, while its overlay is open over the page). */
  active?: boolean;
  /** The row's keyboard shortcut, for screen readers (aria-keyshortcuts); not shown. */
  keyShortcuts?: string;
  /** Opens the link's right-click menu at the pointer. */
  onMenu?: (at: { x: number; y: number }) => void;
}) {
  return (
    <NavLink
      to={destination.to}
      end={destination.end}
      data-active={active || undefined}
      aria-keyshortcuts={keyShortcuts}
      onContextMenu={
        onMenu &&
        ((event) => {
          event.preventDefault();
          onMenu({ x: event.clientX, y: event.clientY });
        })
      }
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

/** Where a right-click menu opened, and on what: a Tab (by id) or a Sidebar link. */
type MenuTarget = { x: number; y: number; on: { tab: string } | { link: Destination } };

/** The right-click menu for `target`, from the Tabs now; none once its Tab has closed. */
function menuState(
  target: MenuTarget | null,
  tabs: TabActions,
  open: (path: string) => void,
  platform: Platform,
): ContextMenuState | null {
  if (!target) return null;
  const { x, y, on } = target;
  if ("link" in on) {
    return { x, y, label: on.link.label, items: linkMenu(on.link.to, tabs, open, platform) };
  }
  const tab = tabs.tabs.tabs.find((each) => each.id === on.tab);
  return tab ? { x, y, label: tab.title, items: tabMenu(tab, tabs, platform) } : null;
}

/**
 * The "Search or jump to…" box at the right end of the title row (design "Nimbus Desktop v2", 2a), naming its
 * shortcut: it opens Jump.
 */
function JumpBox({ platform, onClick }: { platform: Platform; onClick: () => void }) {
  const shortcut = shortcutLabel(platform, "K");
  return (
    <UnstyledButton
      className={classes.jumpBox}
      onClick={onClick}
      aria-keyshortcuts={ariaShortcut(platform, "K")}
    >
      <Glyph icon={IconSearch} size={15} />
      <span className={classes.jumpLabel}>Search or jump to…</span>
      <span className={classes.jumpKeys}>{shortcut}</span>
    </UnstyledButton>
  );
}

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
    <Tooltip
      label={`${label} (${shortcutLabel(platform, "\\")})`}
      position="bottom-start"
      withArrow
    >
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
  // RequireUser only shows the shell to a signed-in User.
  const userId = useSession().user!.id;
  const tabs = useTabs(userId, settingsOpen);
  useTabShortcuts(platform, settingsOpen, tabs);
  const navigate = useNavigate();
  // Ctrl or ⌘ , opens Settings from anywhere; while Settings is open it does nothing, so the page open in it stays.
  useShortcut(
    (event) => isSettingsShortcut(event, platform),
    () => {
      if (!settingsOpen) void navigate(SETTINGS.to);
    },
  );
  useNewTabClicks(platform, tabs.openNew, navigate);
  // The right-click menu open now (a Tab's, a Sidebar link's), if any.
  const [menuAt, setMenuAt] = useState<MenuTarget | null>(null);
  // Built from the Tabs as they are now, not as they were when it opened: a Tab named or closed meanwhile shows.
  const menu = menuState(menuAt, tabs, navigate, platform);

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
  useShortcut((event) => isFoldShortcut(event, platform), toggle);

  const [jumpOpen, setJumpOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // Not over "Sign out?", which may be signing out; a right-click menu open underneath closes.
  const openJump = () => {
    if (signingOut) return;
    setMenuAt(null);
    setJumpOpen(true);
  };
  useShortcut((event) => isJumpShortcut(event, platform), openJump);
  const { mode, setMode } = useNimbusTheme();
  const jumpToPages = jumpPages(useSettingsGroups());
  /**
   * Opens a page from Jump: in the Tab already showing it, if another one does, else in the selected Tab, or in a new
   * Tab when asked; a Settings page in the Settings overlay. While Settings is open over a Tab's page the Tabs stay as
   * they are, as their shortcuts do: the page opens in place, leaving Settings as a link would.
   */
  const openPage = (to: string, inNewTab: boolean) => {
    if (isSettingsPath(to) || settingsOpen) {
      void navigate(to);
      return;
    }
    if (inNewTab) {
      tabs.openNew(to);
      return;
    }
    const shown = tabs.tabs.tabs.find((tab) => tab.path === to);
    if (shown && shown.id !== tabs.tabs.selected) tabs.select(shown.id);
    else void navigate(to);
  };
  // Jump's commands (design "Nimbus Desktop v2", Search), with the shortcuts that do the same.
  const jumpActions: JumpAction[] = [
    {
      kind: "action",
      id: "new-project",
      label: "New project",
      icon: IconFolderPlus,
      // Projects is where a project is created: opened the way the page is.
      run: () => openPage("/projects", false),
    },
    {
      kind: "action",
      id: "theme",
      label: mode === "dark" ? "Switch to Paper theme" : "Switch to Ink theme",
      icon: IconSunMoon,
      run: () => setMode(mode === "dark" ? "light" : "dark"),
    },
    {
      kind: "action",
      id: "sidebar",
      label: folded ? "Open the Sidebar" : "Fold the Sidebar",
      icon: folded ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse,
      shortcut: shortcutLabel(platform, "\\"),
      run: toggle,
    },
    {
      kind: "action",
      id: "settings",
      label: "Open Settings",
      icon: IconSettings,
      shortcut: shortcutLabel(platform, ","),
      // As its shortcut: while Settings is open, the page open in it stays.
      run: () => {
        if (!settingsOpen) void navigate(SETTINGS.to);
      },
    },
    // Asks first, as the account menu does.
    {
      kind: "action",
      id: "sign-out",
      label: "Sign out",
      icon: IconLogout,
      run: () => setSigningOut(true),
    },
  ];
  /** What picking an item in Jump does: an action runs, a page opens (openPage). */
  const jumpTo = (item: JumpItem, inNewTab: boolean) => {
    setJumpOpen(false);
    if (item.kind === "action") item.run();
    else openPage(item.to, inNewTab);
  };
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
                <SidebarRow
                  key={destination.id}
                  destination={destination}
                  onMenu={(at) => setMenuAt({ ...at, on: { link: destination } })}
                />
              ),
            )}
            <div className={classes.bottom}>
              <SidebarRow
                destination={SETTINGS}
                active={settingsOpen}
                keyShortcuts={ariaShortcut(platform, "Comma")}
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
          <TabRow
            tabs={tabs.tabs}
            onSelect={tabs.select}
            onClose={(id) => tabs.close([id])}
            onNew={() => tabs.openNew("/")}
            onMenu={(tab, at) => setMenuAt({ ...at, on: { tab: tab.id } })}
          />
          <JumpBox platform={platform} onClick={openJump} />
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
      <ContextMenu menu={menu} onClose={() => setMenuAt(null)} />
      <Jump
        opened={jumpOpen}
        platform={platform}
        pages={jumpToPages}
        actions={jumpActions}
        onPick={jumpTo}
        onClose={() => setJumpOpen(false)}
      />
      <SignOutDialog opened={signingOut} onClose={() => setSigningOut(false)} />
    </div>
  );
}
