import { Avatar } from "@mantine/core";
import type { AuditEntry } from "../api/client";
import classes from "./AuditAvatar.module.css";
import { actorName } from "./auditView";

/**
 * Who did it: their picture when they have one (Mantine falls back to initials if it doesn't load), otherwise
 * initials in the design's colours, orange or ink by User (steady for the same one), grey for System.
 */
export function AuditAvatar({ actor, size = 28 }: { actor: AuditEntry["actor"]; size?: 28 | 44 }) {
  const tone = !actor
    ? "system"
    : [...actor.id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 2
      ? "ink"
      : "accent";
  return (
    <Avatar
      size={size}
      src={actor?.avatarUrl ?? null}
      imageProps={{ referrerPolicy: "no-referrer" }}
      name={actorName({ actor })}
      data-tone={tone}
      classNames={{ root: classes.avatar, placeholder: classes.placeholder }}
      aria-hidden
    />
  );
}
