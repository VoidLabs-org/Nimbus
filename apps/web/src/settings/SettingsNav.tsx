import { NavLink } from "react-router";
import { useSettingsGroups } from "./sections";
import classes from "./SettingsNav.module.css";

/**
 * The Settings pages a User may open, under their group headings, the open one highlighted: the list beside a
 * Settings page, in the Desktop app's Settings overlay and in a browser's Settings layout alike, so the two can't
 * drift apart. A Role's page highlights Roles & access, the list it belongs to.
 */
export function SettingsNav({ className }: { className?: string }) {
  const groups = useSettingsGroups();
  return (
    <nav aria-label="Settings pages" className={className}>
      {groups.map((group) => (
        <div key={group.label} className={classes.group}>
          <div className={classes.heading}>{group.label}</div>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? `${classes.item} ${classes.active}` : classes.item
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}
