import { Avatar } from "@mantine/core";

/**
 * A User's Profile picture: their image when there is one, otherwise their initials on orange. An image that fails to
 * load falls back to the initials too. `name` null is Nimbus itself (the Audit log's System), drawn in grey.
 * Decorative: the name always appears next to it, so screen readers skip it.
 */
export function ProfilePicture({
  name,
  src,
  size,
}: {
  /** The User's display name, for the initials; null for System. */
  name: string | null;
  src?: string | null;
  size: number;
}) {
  return (
    <Avatar
      size={size}
      src={src ?? null}
      // Google's image host refuses some requests that carry a referrer.
      imageProps={{ referrerPolicy: "no-referrer" }}
      name={name ?? "System"}
      data-tone={name === null ? "system" : "accent"}
      className="nimbus-profile-picture"
      aria-hidden
    />
  );
}
