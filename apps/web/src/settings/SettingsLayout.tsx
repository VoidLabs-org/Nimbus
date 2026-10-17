import { Anchor, Title } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { Link, Outlet, useLocation } from "react-router";
import { useSession } from "../auth/useSession";
import classes from "./SettingsLayout.module.css";
import { useSettingsGroups, type SettingsGroup } from "./sections";

/**
 * Settings, as the overview list of the design (variant 16c): `/settings` lists every page the User may open, a row
 * each, and a row opens that page at full width. Every page has a link back to the list.
 */
export default function SettingsLayout() {
  const groups = useSettingsGroups();
  const { pathname } = useLocation();

  if (pathname === "/settings" || pathname === "/settings/") return <Overview groups={groups} />;

  // A Role's page has its own link back to the list of Roles, which leads back here.
  const hasOwnBack = /^\/settings\/roles\/[^/]+/.test(pathname);

  return (
    <>
      {!hasOwnBack && (
        <Anchor component={Link} to="/settings" display="inline-block" mt="md">
          ← Settings
        </Anchor>
      )}
      <Outlet />
    </>
  );
}

function Overview({ groups }: { groups: SettingsGroup[] }) {
  const { user } = useSession();
  return (
    <div className={classes.overview}>
      <Title order={1} fz={40} lh={1.1}>
        Settings
      </Title>
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className={classes.groupLabel}>{group.label}</h2>
          <Panel p={0}>
            <ul className={classes.rows}>
              {group.items.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className={classes.row}>
                    <span>
                      <span className={classes.rowTitle}>{item.label}</span>
                      <span className={classes.rowDescription}>
                        {item.to === "/settings/profile" && user
                          ? user.displayName
                          : item.description}
                      </span>
                    </span>
                    <span aria-hidden>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      ))}
    </div>
  );
}
