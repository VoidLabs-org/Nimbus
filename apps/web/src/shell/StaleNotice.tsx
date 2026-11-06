import { IconRefreshAlert } from "@tabler/icons-react";
import classes from "./StaleNotice.module.css";

/**
 * A refresh that failed while the page still shows what it loaded before: one quiet line, not an alert box, as the
 * page still works. The same on every page that keeps showing cached data.
 */
export function StaleNotice({
  title,
  shown,
  onRetry,
}: {
  /** "Couldn't refresh these Issues" */
  title: string;
  /** "the last loaded list" */
  shown: string;
  onRetry: () => void;
}) {
  return (
    <div className={classes.notice} role="status">
      <IconRefreshAlert size={16} aria-hidden className={classes.icon} />
      <span>
        <strong>{title}.</strong> Showing {shown}.
      </span>
      <button type="button" className={classes.retry} onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
