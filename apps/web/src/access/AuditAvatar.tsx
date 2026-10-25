import { ProfilePicture } from "@repo/ui/profile-picture";
import type { AuditEntry } from "../api/client";
import { actorName } from "./auditView";

/** Who did it: their Profile picture, or System's grey initial when nobody did. */
export function AuditAvatar({ actor, size = 28 }: { actor: AuditEntry["actor"]; size?: 28 | 44 }) {
  return (
    <ProfilePicture name={actor ? actorName({ actor }) : null} src={actor?.avatarUrl} size={size} />
  );
}
