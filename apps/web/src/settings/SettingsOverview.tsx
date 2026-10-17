import { Title } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { Link } from "react-router";
import { useSession } from "../auth/useSession";
import classes from "./SettingsOverview.module.css";
import { useSettingsGroups } from "./sections";

/**
 * Settings, as the overview list of the design (variant 16c): every page the User may open, a row each, and a row
 * opens that page at full width. Each of those pages has a link back here (see BackToSettings).
 */
export default function SettingsOverview() {
  const groups = useSettingsGroups();
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
