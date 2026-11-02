/** "5m ago", "3h ago", "2d ago"; older than a month, the date. */
export function timeAgo(at: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(at).getTime()) / 60000));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 43200) return `${Math.floor(minutes / 1440)}d`;
  return new Date(at).toLocaleDateString();
}
