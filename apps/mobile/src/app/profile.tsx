import {
  ApiError,
  displayNameError,
  NetworkError,
  pictureFileError,
  providerName,
  tooManyAttemptsMessage,
  UNREADABLE,
  uploadLimitMessage,
  WRONG_FILE,
} from "@repo/api";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { BackLink } from "../components/BackLink";
import { Button, LinkButton } from "../components/Button";
import { FormMessage } from "../components/FormMessage";
import { ProfilePicture } from "../components/ProfilePicture";
import { Screen } from "../components/Screen";
import { SettingsGroup, SettingsRow } from "../components/SettingsRows";
import { Sheet } from "../components/Sheet";
import { Text } from "../components/Text";
import { TextField } from "../components/TextField";
import { Toast } from "../components/Toast";
import type { PictureSource, User } from "../session/client";
import { useSession } from "../session/session";

const PICTURE_UPDATED = "Profile picture updated";

/** By the file's ending, for a picked photo the picker gave no type for. */
const TYPES_BY_ENDING: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * The picked photo's type: the picker's, or else what its name says, so a HEIC photo is refused here, before a
 * wasted upload, as the web refuses it. A name that says nothing either is left to the server.
 */
function typeOf(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const ending = asset.fileName?.split(".").pop()?.toLowerCase();
  if (!ending || ending === asset.fileName?.toLowerCase()) return "image/jpeg";
  return TYPES_BY_ENDING[ending] ?? `image/${ending}`;
}

/** A new key for each toast, so the same news twice shows twice. */
function newKey() {
  return String(Date.now());
}

/** What the picker hands over: square, as the picker crops it, and no videos. */
const PICK: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.9,
};

/**
 * Profile (designs M7a, M7b, M7f): the Profile picture with Edit picture, and rows for the display name and the email.
 * Edit picture opens a sheet: a photo from the camera or the library, cropped square by the picker itself (on iOS that
 * is M7c's "Move and scale"; on Android it is the system's own crop), what the picture shows (the uploaded photo,
 * Google, GitHub or initials) and Remove photo, with the web's messages. The email changes on its own screen.
 */
export default function Profile() {
  const { state, api, userChanged } = useSession();
  const params = useLocalSearchParams<{ changedTo?: string; at?: string }>();
  const [pictureSheet, setPictureSheet] = useState(false);
  const [nameSheet, setNameSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  // Under Edit picture: why the last picture change didn't happen.
  const [pictureMessage, setPictureMessage] = useState<string | null>(null);
  // Set by a 429: no new photo until the wait is over (Remove and Show keep working), and its message goes with it.
  const [limit, setLimit] = useState<{ message: string; seconds: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; key: string } | null>(null);

  useEffect(() => {
    if (!limit) return;
    const timer = setTimeout(() => setLimit(null), limit.seconds * 1000);
    return () => clearTimeout(timer);
  }, [limit]);

  if (state.kind !== "signedIn") return null;
  const { user } = state;
  // Change email comes back here with the address it changed to.
  const shownToast =
    toast ??
    (params.changedTo && params.at
      ? { message: `Email changed to ${params.changedTo}`, key: params.at }
      : null);

  function done(message: string, changed: User) {
    userChanged(changed);
    setPictureMessage(null);
    setToast({ message, key: newKey() });
  }

  async function pickPhoto(from: "camera" | "library") {
    setPictureSheet(false);
    setPictureMessage(null);
    let picked: ImagePicker.ImagePickerResult;
    try {
      if (from === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setPictureMessage(
            "Allow Nimbus to use the camera in your phone’s settings, then try again.",
          );
          return;
        }
      }
      picked =
        from === "camera"
          ? await ImagePicker.launchCameraAsync(PICK)
          : await ImagePicker.launchImageLibraryAsync(PICK);
    } catch {
      // No camera, or the phone's picker failed to open.
      setPictureMessage(
        from === "camera"
          ? "Couldn't open the camera. Please try again."
          : "Couldn't open your photos. Please try again.",
      );
      return;
    }
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    const type = typeOf(asset);
    const wrong = pictureFileError({ type, size: asset.fileSize });
    if (wrong) {
      setPictureMessage(wrong);
      return;
    }
    setBusy(true);
    try {
      const changed = await api.uploadProfilePicture({
        uri: asset.uri,
        name: asset.fileName ?? "profile-picture.jpg",
        type,
      });
      done(PICTURE_UPDATED, changed);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 429) {
        setLimit({
          message: uploadLimitMessage(failure.retryAfterSeconds),
          seconds: failure.retryAfterSeconds ?? 60,
        });
      } else if (failure instanceof ApiError && failure.status === 400) {
        setPictureMessage(failure.code === "unreadable_image" ? UNREADABLE : WRONG_FILE);
      } else {
        setPictureMessage("Couldn't upload your photo. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function show(source: PictureSource) {
    setPictureSheet(false);
    if (source === user.pictureSource) return;
    setPictureMessage(null);
    setBusy(true);
    try {
      done(PICTURE_UPDATED, await api.choosePictureSource(source));
    } catch (failure) {
      setPictureMessage(
        failure instanceof ApiError && failure.code === "source_unavailable"
          ? "That picture isn't available any more."
          : "Couldn't change your profile picture. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setPictureSheet(false);
    setPictureMessage(null);
    setBusy(true);
    try {
      await api.removeProfilePicture();
    } catch {
      setPictureMessage("Couldn't remove your photo. Check your connection and try again.");
      setBusy(false);
      return;
    }
    // It is gone either way; reading the User again only shows what they show now, and a later read catches up.
    const changed = await api.me().catch(() => null);
    if (changed) done(PICTURE_UPDATED, changed);
    else setToast({ message: PICTURE_UPDATED, key: newKey() });
    setBusy(false);
  }

  const { uploadedAt, providers } = user.pictureOptions;
  const choices: { source: PictureSource; label: string }[] = [
    ...(uploadedAt ? [{ source: "uploaded" as const, label: "Use uploaded photo" }] : []),
    ...providers.map((option) => ({
      source: option.provider,
      label: `Use ${providerName(option.provider) ?? option.provider} picture`,
    })),
    { source: "initials", label: "Use initials" },
  ];

  return (
    <Screen
      scroll
      overlay={shownToast ? <Toast key={shownToast.key} message={shownToast.message} /> : null}
    >
      <BackLink label="Settings" onPress={() => router.back()} />
      <Text weight="semibold" size={32} accessibilityRole="header">
        Profile
      </Text>
      <View style={styles.picture}>
        <View>
          <ProfilePicture user={user} size={104} />
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color="#ffffff" />
            </View>
          ) : null}
        </View>
        <LinkButton label="Edit picture" disabled={busy} onPress={() => setPictureSheet(true)} />
        {(limit?.message ?? pictureMessage) ? (
          <FormMessage message={limit?.message ?? pictureMessage!} />
        ) : null}
      </View>
      <SettingsGroup>
        <SettingsRow
          title="Display name"
          detail={user.displayName}
          onPress={() => setNameSheet(true)}
        />
        <SettingsRow
          title="Email"
          detail={user.email}
          badge={user.emailVerified ? "Verified" : undefined}
          onPress={() => router.push("/change-email")}
          divided
        />
      </SettingsGroup>

      <Sheet open={pictureSheet} onClose={() => setPictureSheet(false)}>
        <Text weight="semibold" size={22} accessibilityRole="header">
          Profile picture
        </Text>
        <Button
          label="Take photo"
          variant="secondary"
          disabled={limit !== null}
          onPress={() => void pickPhoto("camera")}
        />
        <Button
          label="Choose from library"
          variant="secondary"
          disabled={limit !== null}
          onPress={() => void pickPhoto("library")}
        />
        <Text muted size={13} weight="semibold" style={styles.show}>
          Show
        </Text>
        {choices.map((choice) => (
          <Button
            key={choice.source}
            label={
              choice.source === user.pictureSource ? `${choice.label} · shown now` : choice.label
            }
            variant="secondary"
            disabled={choice.source === user.pictureSource}
            onPress={() => void show(choice.source)}
          />
        ))}
        {user.hasUploadedPicture ? (
          <Button label="Remove photo" variant="danger" onPress={() => void removePhoto()} />
        ) : null}
        <Button label="Cancel" variant="secondary" onPress={() => setPictureSheet(false)} />
      </Sheet>

      <Sheet open={nameSheet} onClose={() => setNameSheet(false)}>
        {/* Inside the sheet, so each time it opens the form starts from the saved name. */}
        {nameSheet ? (
          <DisplayNameForm
            current={user.displayName}
            onSaved={(changed) => {
              setNameSheet(false);
              done("Display name saved.", changed);
            }}
            onCancel={() => setNameSheet(false)}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

/** Edit display name, as the web's window: the web's checks and messages. */
function DisplayNameForm({
  current,
  onSaved,
  onCancel,
}: {
  current: string;
  onSaved: (user: User) => void;
  onCancel: () => void;
}) {
  const { api } = useSession();
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    // The keyboard's Return can submit an unchanged name, which the button can't.
    if (saving || name === current) return;
    const mistake = displayNameError(name);
    setError(mistake);
    if (mistake) return;
    setSaving(true);
    try {
      onSaved(await api.updateDisplayName(name.trim()));
    } catch (failure) {
      if (failure instanceof ApiError && failure.fieldErrors.displayName) {
        setError(failure.fieldErrors.displayName);
      } else if (failure instanceof ApiError && failure.status === 429) {
        setError(tooManyAttemptsMessage(failure.retryAfterSeconds));
      } else if (failure instanceof NetworkError) {
        setError("Couldn't save your name. Check your connection and try again.");
      } else {
        setError("Couldn't save your name. Please try again.");
      }
      setSaving(false);
    }
  }

  return (
    <>
      <Text weight="semibold" size={22} accessibilityRole="header">
        Edit display name
      </Text>
      <Text muted>How you appear to your team.</Text>
      <TextField
        label="Display name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError(null);
        }}
        autoFocus
        autoComplete="name"
        textContentType="name"
        invalid={error !== null}
        onSubmitEditing={() => void save()}
      />
      {error ? <FormMessage message={error} indent /> : null}
      <Button
        label="Save changes"
        busy={saving}
        disabled={name === current}
        onPress={() => void save()}
      />
      <Button label="Cancel" variant="secondary" disabled={saving} onPress={onCancel} />
    </>
  );
}

const styles = StyleSheet.create({
  picture: { alignItems: "center", gap: 10, paddingVertical: 8 },
  busy: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 52,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  show: { marginTop: 6, textTransform: "uppercase", letterSpacing: 1 },
});
