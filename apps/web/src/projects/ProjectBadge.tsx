import classes from "./ProjectBadge.module.css";

/**
 * A project's key in a round badge (design 33a and 33e): round for a short key, a pill for a longer one, in one of
 * three colours picked from the key, so a project keeps its colour everywhere.
 */
export function ProjectBadge({
  projectKey,
  size = "md",
}: {
  projectKey: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className={classes.badge} data-size={size} data-tone={tone(projectKey)}>
      {projectKey}
    </span>
  );
}

function tone(key: string) {
  let sum = 0;
  for (const char of key) sum += char.codePointAt(0) ?? 0;
  return ["muted", "ink", "accent"][sum % 3];
}
