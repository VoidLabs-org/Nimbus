import { IconArrowUp, IconChevronRight, IconDots } from "@tabler/icons-react";
import { Glyph } from "@repo/ui/glyph";
import { Menu, Skeleton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Link } from "react-router";
import { overlayCrumbs } from "../settings/crumbs";
import { useSettingsOverlay } from "../settings/settingsOverlay";
import classes from "./BreadcrumbTrail.module.css";
import { collapseCrumbs, type Crumb } from "./crumbs";

/** Below this a long path folds its middle into a menu (variant 21d of the design). */
const NARROW = "(max-width: 36em)";

/**
 * Breadcrumbs: where the page is, as quiet text above its title (variant 21a): every crumb but the last is a link, the last is
 * the page itself. On a narrow screen a path of four or more crumbs tucks the ones between the first and last into a
 * dots menu and adds an "up" button to the parent. Built by hand rather than on Mantine's Breadcrumbs, which is a
 * plain div: this one is a nav with an ordered list and marks the current page.
 */
export function BreadcrumbTrail({ crumbs: path }: { crumbs: Crumb[] }) {
  const narrow = useMediaQuery(NARROW, false, { getInitialValueInEffect: false });
  // Inside the Desktop app's Settings overlay, its list stands in for the Settings overview (see overlayCrumbs).
  const crumbs = useSettingsOverlay() === "inside" ? overlayCrumbs(path) : path;
  const loading = crumbs.some((crumb) => crumb.pending);
  const { shown, hidden, up } = collapseCrumbs(crumbs, narrow);
  // The menu lists the folded steps that go somewhere, once each: a placeholder or the page itself has no link, and
  // two steps that lead to the same place (a tab and the list it is on) are one entry.
  const menu = hidden.filter(
    (crumb, index) => crumb.to && hidden.findIndex((other) => other.to === crumb.to) === index,
  );
  // The first crumb, the folded ones (when there are any), then the rest.
  const steps: ({ crumb: Crumb } | "folded")[] = [
    { crumb: shown[0]! },
    ...(menu.length > 0 ? (["folded"] as const) : []),
    ...shown.slice(1).map((crumb) => ({ crumb })),
  ];

  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={classes.nav} aria-busy={loading || undefined}>
      {up?.to && (
        <Link
          to={up.to}
          className={classes.up}
          aria-label={`Up to ${up.label}`}
          title={`Up to ${up.label}`}
        >
          <Glyph icon={IconArrowUp} size={18} />
        </Link>
      )}
      <ol className={classes.list}>
        {steps.map((step, index) => (
          <li
            key={step === "folded" ? "folded" : `${index}-${step.crumb.label}`}
            className={classes.item}
          >
            {step === "folded" ? (
              <Menu
                position="bottom-start"
                classNames={{ dropdown: classes.dropdown, item: classes.menuItem }}
              >
                <Menu.Target>
                  <button
                    type="button"
                    className={classes.folded}
                    aria-label="Show the steps in between"
                  >
                    <Glyph icon={IconDots} />
                  </button>
                </Menu.Target>
                <Menu.Dropdown>
                  {menu.map((crumb) => (
                    <Menu.Item key={crumb.to} component={Link} to={crumb.to!}>
                      {crumb.label}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            ) : step.crumb.pending ? (
              // Shorter for the tab crumb than for the page's name, so the path doesn't jump much when it fills in.
              <Skeleton
                height={14}
                width={index === steps.length - 1 ? 110 : 80}
                radius="xl"
                aria-hidden
              />
            ) : step.crumb.to ? (
              <Link to={step.crumb.to} className={classes.link}>
                {step.crumb.label}
              </Link>
            ) : (
              <span className={classes.current} aria-current="page">
                {step.crumb.label}
              </span>
            )}
            {index < steps.length - 1 && (
              <span className={classes.separator}>
                <Glyph icon={IconChevronRight} size={14} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
