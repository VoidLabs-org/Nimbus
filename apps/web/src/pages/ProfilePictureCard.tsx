import { Button } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { toast } from "@repo/ui/toast";
import { useRef, useState } from "react";
import { ApiError, type User } from "../api/client";
import { useSession } from "../auth/useSession";
import {
  PICTURE_HINT,
  PICTURE_TYPES,
  pictureFileError,
  UNREADABLE,
  WRONG_FILE,
} from "../settings/profilePicture";
import { PositionPhotoDialog } from "./PositionPhotoDialog";
import classes from "./ProfilePictureCard.module.css";

/**
 * Profile's picture card (design 35a, without the Show choice yet): the User's picture and "Upload photo". A chosen file
 * is checked here first (35e), then positioned in "Position your photo" (35c) and uploaded; what goes wrong replaces
 * the hint in red (35e, 35f).
 */
export function ProfilePictureCard({ user }: { user: User }) {
  const { uploadProfilePicture } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ file: File; src: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function choose(file: File | undefined) {
    // So picking the same file again still counts as a change.
    if (input.current) input.current.value = "";
    if (!file) return;
    const wrong = pictureFileError(file);
    setError(wrong);
    if (!wrong) setPhoto({ file, src: URL.createObjectURL(file) });
  }

  function finish() {
    if (photo) URL.revokeObjectURL(photo.src);
    setPhoto(null);
  }

  // Not while saving: a failed upload keeps the window open to try again, so it must still be there.
  function close() {
    if (!saving) finish();
  }

  async function save(picture: Blob) {
    setSaving(true);
    try {
      await uploadProfilePicture(picture);
      toast.success("Profile picture updated");
      finish();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 400) {
        setError(failure.code === "unreadable_image" ? UNREADABLE : WRONG_FILE);
        finish();
      } else {
        // The window stays open with the photo where the User put it, to try again.
        toast.error("Couldn't upload your photo. Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Profile picture">
      <Panel p={22}>
        <div className={classes.head}>
          <ProfilePicture name={user.displayName} src={user.avatarUrl} size={88} />
          <div className={classes.text}>
            <div className={classes.title}>Profile picture</div>
            <div className={classes.actions}>
              <Button variant="default" onClick={() => input.current?.click()}>
                Upload photo
              </Button>
              <input
                ref={input}
                type="file"
                accept={PICTURE_TYPES.join(",")}
                className={classes.file}
                aria-label="Choose a photo"
                tabIndex={-1}
                onChange={(event) => choose(event.currentTarget.files?.[0])}
              />
            </div>
            <div
              className={error ? classes.error : classes.hint}
              role={error ? "alert" : undefined}
            >
              {error ?? PICTURE_HINT}
            </div>
          </div>
        </div>
      </Panel>
      <PositionPhotoDialog photo={photo} saving={saving} onSave={save} onClose={close} />
    </section>
  );
}
