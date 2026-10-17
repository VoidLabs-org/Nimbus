import { useState } from "react";
import type { AuditEntry } from "../api/client";
import classes from "./AuditAvatar.module.css";
import { actorName, initialsOf } from "./auditView";

/**
 * Who did it, in a round chip: their picture when they have one (and it loads), otherwise initials as in the design,
 * orange or ink by User (steady for the same one), grey for System.
 */
export function AuditAvatar({ actor, size = 28 }: { actor: AuditEntry["actor"]; size?: 28 | 44 }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const picture = actor?.avatarUrl && actor.avatarUrl !== failedUrl ? actor.avatarUrl : null;
  const tone = !actor
    ? "system"
    : [...actor.id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 2
      ? "ink"
      : "accent";
  return (
    <span className={classes.avatar} data-tone={tone} data-size={size} aria-hidden>
      {picture ? (
        <img
          className={classes.picture}
          src={picture}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(picture)}
        />
      ) : actor ? (
        initialsOf(actorName({ actor }))
      ) : (
        "S"
      )}
    </span>
  );
}
