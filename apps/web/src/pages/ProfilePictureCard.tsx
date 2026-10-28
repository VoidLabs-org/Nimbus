import { Button } from "@mantine/core";
import { Panel } from "@repo/ui/panel";
import { ProfilePicture } from "@repo/ui/profile-picture";
import { toast } from "@repo/ui/toast";
import { useEffect, useRef, useState } from "react";
import { ApiError, type User } from "../api/client";
import { useSession } from "../auth/useSession";
import {
  PICTURE_HINT,
  PICTURE_TYPES,
  pictureFileError,
  UNREADABLE,
  uploadLimitMessage,
  WRONG_FILE,
} from "../settings/profilePicture";
import { PictureSourceChoice } from "./PictureSourceChoice";
import { PositionPhotoDialog } from "./PositionPhotoDialog";
import classes from "./ProfilePictureCard.module.css";

/**
 * Profile's picture card (design 35a): the User's picture and "Upload photo", or Replace
 * and Remove once they have an upload (35d). A chosen file is checked here first (35e), then positioned in "Position
 * your photo" (35c) and uploaded; what goes wrong replaces the hint in red (35e, 35f). After 10 uploads in an hour the
 * message says how long to wait (35g) and the upload button stays disabled until then; Remove keeps working.
 */
export function ProfilePictureCard({ user }: { user: User }) {
  const { uploadProfilePicture, removeProfilePicture } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ file: File; src: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Set by a 429; cleared once the wait is over.
  const [limit, setLimit] = useState<{ message: string; seconds: number } | null>(null);

  useEffect(() => {
    if (!limit) return;
    const timer = setTimeout(() => setLimit(null), limit.seconds * 1000);
    return () => clearTimeout(timer);
  }, [limit]);

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
      if (failure instanceof ApiError && failure.status === 429) {
        const seconds = failure.retryAfterSeconds ?? 60;
        setLimit({ message: uploadLimitMessage(failure.retryAfterSeconds), seconds });
        finish();
      } else if (failure instanceof ApiError && failure.status === 400) {
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

  async function remove() {
    setRemoving(true);
    try {
      await removeProfilePicture();
      setError(null);
      toast.success("Profile picture updated");
    } catch {
      toast.error("Couldn't remove your photo. Check your connection and try again.");
    } finally {
      setRemoving(false);
    }
  }

  const message = limit?.message ?? error;
  return (
    <section aria-label="Profile picture">
      <Panel p={22}>
        <div className={classes.head}>
          <ProfilePicture name={user.displayName} src={user.avatarUrl} size={88} />
          <div className={classes.text}>
            <div className={classes.title}>Profile picture</div>
            <div className={classes.actions}>
              <Button
                variant="default"
                disabled={limit !== null || removing}
                onClick={() => input.current?.click()}
              >
                {user.hasUploadedPicture ? "Replace" : "Upload photo"}
              </Button>
              {user.hasUploadedPicture && (
                <Button variant="default" loading={removing} disabled={saving} onClick={remove}>
                  Remove
                </Button>
              )}
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
              className={message ? classes.error : classes.hint}
              role={message ? "alert" : undefined}
            >
              {message ?? PICTURE_HINT}
            </div>
          </div>
        </div>
        <PictureSourceChoice user={user} />
      </Panel>
      <PositionPhotoDialog photo={photo} saving={saving} onSave={save} onClose={close} />
    </section>
  );
}
