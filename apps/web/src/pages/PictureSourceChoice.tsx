import { ProfilePicture } from "@repo/ui/profile-picture";
import { toast } from "@repo/ui/toast";
import { useState } from "react";
import type { PictureSource, User } from "../api/client";
import { useSession } from "../auth/useSession";
import { initialsOf, uploadedOn } from "../settings/profilePicture";
import classes from "./PictureSourceChoice.module.css";

type Choice = {
  source: PictureSource;
  title: string;
  hint: string;
  /** The thumbnail's image; null draws the User's initials. */
  src: string | null;
  disabled?: boolean;
};

/**
 * "Show" on Profile's picture card (design 35a, 35b, 35d): pill cards for what the Profile picture shows. Each pick
 * saves at once. Google and GitHub are listed only while connected with a picture; the uploaded photo is always listed,
 * disabled until there is one.
 */
export function PictureSourceChoice({ user }: { user: User }) {
  const { choosePictureSource } = useSession();
  const [saving, setSaving] = useState<PictureSource | null>(null);
  const { uploadedAt, uploadedUrl, providers } = user.pictureOptions;

  const choices: Choice[] = [
    {
      source: "uploaded",
      title: "Uploaded photo",
      hint: uploadedAt ? `Added ${uploadedOn(uploadedAt)}` : "Upload a photo to use this",
      src: uploadedUrl,
      disabled: !uploadedAt,
    },
    ...providers.map((option): Choice => ({
      source: option.provider,
      title: option.provider === "google" ? "Google" : "GitHub",
      hint: option.label,
      src: option.pictureUrl,
    })),
    {
      source: "initials",
      title: "Initials",
      hint: `${initialsOf(user.displayName)} on orange`,
      src: null,
    },
  ];

  async function pick(source: PictureSource) {
    if (saving || source === user.pictureSource) return;
    setSaving(source);
    try {
      await choosePictureSource(source);
      toast.success("Profile picture updated");
    } catch {
      toast.error("Couldn't change your profile picture. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className={classes.root}>
      <div id="picture-source-label" className={classes.label}>
        Show
      </div>
      <div role="radiogroup" aria-labelledby="picture-source-label" className={classes.options}>
        {choices.map((choice) => (
          <button
            key={choice.source}
            type="button"
            role="radio"
            aria-checked={choice.source === user.pictureSource}
            disabled={choice.disabled}
            className={classes.option}
            onClick={() => void pick(choice.source)}
          >
            <ProfilePicture name={user.displayName} src={choice.src} size={36} />
            <span className={classes.text}>
              <span className={classes.title}>{choice.title}</span>
              <span className={classes.hint}>{choice.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
