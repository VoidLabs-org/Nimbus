import type { AuditEntry } from "../api/client";
import { AuditAvatar } from "./AuditAvatar";
import classes from "./AuditEntryModal.module.css";
import { describeAuditEntry } from "./auditText";
import { actorName, auditChanges, auditTitle, diffLines } from "./auditView";
import { RoleFormModal } from "./RoleFormModal";

/**
 * One Audit log entry in full, as in the design: who and what at the top, then When, Who, Role, Action and the summary
 * line, and the changes as a before → after list. Opens over the page and closes with the ✕, Escape or a click outside.
 */
export function AuditEntryModal({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const lines = diffLines(auditChanges(entry));
  return (
    <RoleFormModal
      opened
      onClose={onClose}
      title={
        <span className={classes.title}>
          <AuditAvatar actor={entry.actor} size={44} />
          <span>
            <span className={classes.eyebrow}>Audit entry</span>
            <span className={classes.name}>{auditTitle(entry)}</span>
          </span>
        </span>
      }
    >
      <dl className={classes.facts}>
        <dt>When</dt>
        <dd>
          {new Date(entry.at).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23",
          })}
        </dd>
        <dt>Who</dt>
        <dd>
          <b>{actorName(entry)}</b>
          {entry.actor?.email && <span className={classes.email}>{entry.actor.email}</span>}
        </dd>
        <dt>Role</dt>
        <dd className={classes.mono}>{entry.target.key}</dd>
        <dt>Action</dt>
        <dd className={classes.mono}>{entry.action}</dd>
        <dt>What</dt>
        <dd>{describeAuditEntry(entry)}</dd>
      </dl>
      {lines.length > 0 && (
        <div className={classes.diff}>
          <div className={classes.eyebrow}>Before → after</div>
          <ul className={classes.lines} aria-label="Before and after">
            {lines.map((line, index) => (
              <li key={index} className={classes.line} data-kind={line.kind}>
                {line.kind === "added" ? "+" : "−"} {line.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className={classes.note}>Entries are never edited or deleted.</p>
    </RoleFormModal>
  );
}
