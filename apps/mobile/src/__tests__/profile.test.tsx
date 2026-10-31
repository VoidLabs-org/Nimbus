import {
  EMAIL_TAKEN,
  SAME_EMAIL,
  UNREADABLE,
  WRONG_FILE,
  WRONG_PASSWORD,
  emailChangeCodeMessage,
  uploadLimitMessage,
} from "@repo/api";
import { act, fireEvent, screen } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { ada, fakeApi, photoPicked, renderApp, secureStore } from "../test-support";

import type { User } from "../session/client";

const withPictures: User = {
  ...ada,
  avatarUrl: "/api/users/7a3c/profile-picture?v=1",
  hasUploadedPicture: true,
  pictureSource: "uploaded",
  pictureOptions: {
    uploadedAt: "2026-10-24T10:00:00Z",
    uploadedUrl: "/api/users/7a3c/profile-picture?v=1",
    providers: [
      { provider: "google", label: "ada@gmail.com", pictureUrl: "https://lh3.example/ada.png" },
    ],
  },
};

/** Signed in before, as `user`, and on Profile. */
async function openProfile(api: ReturnType<typeof fakeApi>, user: User = ada) {
  secureStore.set("nimbus.welcomed", "yes");
  secureStore.set("nimbus.refreshToken", "stored-1");
  api.answer("POST /api/auth/refresh", {
    status: 200,
    body: { accessToken: "access-1", refreshToken: "stored-2", user },
  });
  api.answer("GET /api/users/me", { status: 200, body: user });
  await renderApp();
  await screen.findByText(/Projects and issues are on the web for now/);
  await fireEvent.press(screen.getByText("Settings"));
  await fireEvent.press(await screen.findByRole("button", { name: /Profile/ }));
  await screen.findByRole("header", { name: "Profile" });
}

async function openPictureSheet() {
  await fireEvent.press(screen.getByRole("button", { name: "Edit picture" }));
  return screen.findByText("Profile picture");
}

it("is in Settings, with the User's name and email", async () => {
  const api = fakeApi();

  await openProfile(api);

  expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  expect(screen.getByText("ada@example.com")).toBeTruthy();
  expect(screen.getByText("Verified")).toBeTruthy();
});

describe("the display name", () => {
  it("changes, with the web's checks, and shows everywhere at once", async () => {
    const api = fakeApi();
    api.answer("PATCH /api/users/me", { status: 200, body: { ...ada, displayName: "Ada King" } });

    await openProfile(api);
    await fireEvent.press(screen.getByRole("button", { name: /Display name/ }));
    const name = await screen.findByLabelText("Display name");
    await fireEvent.changeText(name, "  ");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Enter your name")).toBeTruthy();
    expect(api.to("PATCH /api/users/me")).toHaveLength(0);

    await fireEvent.changeText(name, " Ada King ");
    await fireEvent.press(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Display name saved.")).toBeTruthy();
    expect(api.to("PATCH /api/users/me")[0]!.body).toEqual({ displayName: "Ada King" });
    expect(screen.getByText("Ada King")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    await fireEvent.press(await screen.findByText("Home"));
    expect(await screen.findByText(/Ada King/)).toBeTruthy();
  });
});

describe("the Profile picture", () => {
  it("uploads a photo from the library, cropped square by the picker", async () => {
    const api = fakeApi();
    api.answer("PUT /api/users/me/profile-picture", { status: 200, body: withPictures });
    const library = photoPicked("library", {});

    await openProfile(api);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));

    expect(await screen.findByText("Profile picture updated")).toBeTruthy();
    expect(library).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: true, aspect: [1, 1], mediaTypes: ["images"] }),
    );
    const [upload] = api.to("PUT /api/users/me/profile-picture");
    expect(upload!.body).toBeInstanceOf(FormData);
    expect(upload!.headers.get("Content-Type")).toBeNull();
  });

  it("takes a photo with the camera once the User allows it", async () => {
    const api = fakeApi();
    api.answer("PUT /api/users/me/profile-picture", { status: 200, body: withPictures });
    const camera = photoPicked("camera", {});

    await openProfile(api);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Take photo" }));

    expect(await screen.findByText("Profile picture updated")).toBeTruthy();
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(camera).toHaveBeenCalledWith(expect.objectContaining({ allowsEditing: true }));
  });

  it("says how to allow the camera when the User said no", async () => {
    const api = fakeApi();
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      granted: false,
    });

    await openProfile(api);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Take photo" }));

    expect(await screen.findByText(/Allow Nimbus to use the camera/)).toBeTruthy();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it("does nothing when the User backs out of the picker", async () => {
    const api = fakeApi();
    photoPicked("library", "cancelled");

    await openProfile(api);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));

    expect(api.to("PUT /api/users/me/profile-picture")).toHaveLength(0);
  });

  it.each([
    ["a file over 5 MB", { fileSize: 6 * 1024 * 1024 }],
    ["another kind of file", { mimeType: "image/heic" }],
  ])("refuses %s before uploading, as the web does", async (_, asset) => {
    const api = fakeApi();
    photoPicked("library", asset);

    await openProfile(api);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));

    expect(await screen.findByText(WRONG_FILE)).toBeTruthy();
    expect(api.to("PUT /api/users/me/profile-picture")).toHaveLength(0);
  });

  it("says when the server couldn't read the image", async () => {
    const api = fakeApi();
    api.answer("PUT /api/users/me/profile-picture", {
      status: 400,
      body: { detail: "No", code: "unreadable_image" },
    });
    photoPicked("library", {});

    await openProfile(api);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));

    expect(await screen.findByText(UNREADABLE)).toBeTruthy();
  });

  it("says how long to wait after 10 uploads in an hour, and stops offering new photos", async () => {
    const api = fakeApi();
    api.answer("PUT /api/users/me/profile-picture", {
      status: 429,
      headers: { "Retry-After": "1500" },
    });
    photoPicked("library", {});

    await openProfile(api);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));

    expect(await screen.findByText(uploadLimitMessage(1500))).toBeTruthy();
    await openPictureSheet();
    expect(screen.getByRole("button", { name: "Choose from library" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
  });

  it("shows the picture of a connected provider instead", async () => {
    const api = fakeApi();
    api.answer("PUT /api/users/me/profile-picture/source", {
      status: 200,
      body: { ...withPictures, pictureSource: "google" },
    });

    await openProfile(api, withPictures);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Use Google picture" }));

    expect(await screen.findByText("Profile picture updated")).toBeTruthy();
    expect(api.to("PUT /api/users/me/profile-picture/source")[0]!.body).toEqual({
      source: "google",
    });
  });

  it("says when that picture isn't there any more", async () => {
    const api = fakeApi();
    api.answer("PUT /api/users/me/profile-picture/source", {
      status: 400,
      body: { detail: "No", code: "source_unavailable" },
    });

    await openProfile(api, withPictures);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Use initials" }));

    expect(await screen.findByText("That picture isn't available any more.")).toBeTruthy();
  });

  it("removes the uploaded photo and reads the User again", async () => {
    const api = fakeApi();
    api.answer("DELETE /api/users/me/profile-picture", { status: 204 });

    await openProfile(api, withPictures);
    api.answer("GET /api/users/me", { status: 200, body: ada });
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));

    expect(await screen.findByText("Profile picture updated")).toBeTruthy();
    expect(api.to("DELETE /api/users/me/profile-picture")).toHaveLength(1);
    await openPictureSheet();
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
  });
});

describe("changing the email", () => {
  async function openChangeEmail(api: ReturnType<typeof fakeApi>, user: User = ada) {
    await openProfile(api, user);
    await fireEvent.press(screen.getByRole("button", { name: /Email/ }));
    await screen.findByText("Change your email");
  }

  async function sendCodeTo(email: string) {
    await fireEvent.changeText(screen.getByLabelText("New email"), email);
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
  }

  it("sends a code to the new address, and changes it once the code is right", async () => {
    const api = fakeApi();
    api.answer("POST /api/users/me/email-change", { status: 204 });
    api.answer("POST /api/users/me/email-change/confirm", {
      status: 200,
      body: { ...ada, email: "ada@new.example" },
    });

    await openChangeEmail(api);
    await sendCodeTo(" ada@new.example ");
    expect(await screen.findByText("Check your new inbox")).toBeTruthy();
    expect(screen.getByText("ada@new.example")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Verification code"), "290415");
    await fireEvent.press(screen.getByRole("button", { name: "Change email" }));

    expect(await screen.findByText("Email changed to ada@new.example")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Profile" })).toBeTruthy();
    expect(screen.getByText("ada@new.example")).toBeTruthy();
    expect(api.to("POST /api/users/me/email-change")[0]!.body).toEqual({
      email: "ada@new.example",
    });
    expect(api.to("POST /api/users/me/email-change/confirm")[0]!.body).toEqual({
      code: "290415",
    });
  });

  it.each([
    ["same_email", 400, SAME_EMAIL],
    ["email_taken", 409, EMAIL_TAKEN],
  ])("says what is wrong with the address (%s)", async (code, status, message) => {
    const api = fakeApi();
    api.answer("POST /api/users/me/email-change", { status, body: { detail: "No", code } });

    await openChangeEmail(api);
    await sendCodeTo("ada@example.com");

    expect(await screen.findByText(message)).toBeTruthy();
  });

  it("says how many tries a wrong code leaves, and offers a new code once it expired", async () => {
    const api = fakeApi();
    api.answer("POST /api/users/me/email-change", { status: 204 });
    api.answer(
      "POST /api/users/me/email-change/confirm",
      { status: 400, body: { detail: "No", code: "invalid_code", triesLeft: 3 } },
      { status: 400, body: { detail: "No", code: "code_expired" } },
    );

    await openChangeEmail(api);
    await sendCodeTo("ada@new.example");
    await fireEvent.changeText(await screen.findByLabelText("Verification code"), "111111");
    await fireEvent.press(screen.getByRole("button", { name: "Change email" }));
    expect(await screen.findByText(emailChangeCodeMessage(3))).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Verification code"), "222222");
    await fireEvent.press(screen.getByRole("button", { name: "Change email" }));
    expect(await screen.findByText("This code has expired")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send a new code/ })).toBeTruthy();
  });

  it("asks the password first for a sign-in too old for it, then sends the code", async () => {
    const api = fakeApi();
    api.answer(
      "POST /api/users/me/email-change",
      { status: 403, body: { detail: "No", code: "reauth_required" } },
      { status: 204 },
    );
    api.answer(
      "POST /api/users/me/confirm",
      { status: 400, body: { detail: "No", errors: { password: "Wrong" } } },
      { status: 204 },
    );

    await openChangeEmail(api);
    await sendCodeTo("ada@new.example");
    expect(await screen.findByText("Confirm it’s you")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Password"), "wrong");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(WRONG_PASSWORD)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Check your new inbox")).toBeTruthy();
    expect(api.to("POST /api/users/me/confirm")[1]!.body).toEqual({ password: "correct horse" });
    expect(api.to("POST /api/users/me/email-change")).toHaveLength(2);
  });

  it("asks the Sign-in code too for a User with Two-step verification", async () => {
    const api = fakeApi();
    api.answer(
      "POST /api/users/me/email-change",
      { status: 403, body: { detail: "No", code: "reauth_required" } },
      { status: 204 },
    );
    api.answer(
      "POST /api/users/me/confirm",
      { status: 400, body: { detail: "No", code: "two_step_required" } },
      { status: 204 },
    );

    await openChangeEmail(api);
    await sendCodeTo("ada@new.example");
    await fireEvent.changeText(await screen.findByLabelText("Password"), "correct horse");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter your Sign-in code")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Sign-in code"), "381002");
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Check your new inbox")).toBeTruthy();
    expect(api.to("POST /api/users/me/confirm")[1]!.body).toEqual({
      password: "correct horse",
      twoStepCode: "381002",
    });
  });

  it("has a User without a password sign in again instead", async () => {
    const api = fakeApi();
    api.answer("POST /api/users/me/email-change", {
      status: 403,
      body: { detail: "No", code: "reauth_required" },
    });
    api.answer("POST /api/auth/logout", { status: 204 });

    await openChangeEmail(api, { ...ada, hasPassword: false });
    await sendCodeTo("ada@new.example");
    const sheet = await screen.findByText("Sign in again to change your email");
    expect(sheet).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Sign in again" });
    await fireEvent.press(buttons[buttons.length - 1]!);

    expect(await screen.findByText("Welcome back")).toBeTruthy();
    expect(api.to("POST /api/auth/logout")).toHaveLength(1);
  });

  it("goes back to Profile without changing anything", async () => {
    const api = fakeApi();

    await openChangeEmail(api);
    await fireEvent.press(screen.getByRole("button", { name: "Profile" }));

    expect(await screen.findByRole("header", { name: "Profile" })).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
  });
});

describe("after the review", () => {
  it("comes back to Profile above the tabs after signing in again, so Settings is one step back", async () => {
    const api = fakeApi();
    api.answer("POST /api/users/me/email-change", {
      status: 403,
      body: { detail: "No", code: "reauth_required" },
    });
    api.answer("POST /api/auth/logout", { status: 204 });
    const noPassword = { ...ada, hasPassword: false };

    await openProfile(api, noPassword);
    await fireEvent.press(screen.getByRole("button", { name: /Email/ }));
    await fireEvent.changeText(await screen.findByLabelText("New email"), "ada@new.example");
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    await screen.findByText("Sign in again to change your email");
    const buttons = screen.getAllByRole("button", { name: "Sign in again" });
    await fireEvent.press(buttons[buttons.length - 1]!);
    api.answer("POST /api/auth/login", {
      status: 200,
      body: { accessToken: "access-2", refreshToken: "refresh-2", user: noPassword },
    });
    await fireEvent.changeText(await screen.findByLabelText("Email"), "ada@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("header", { name: "Profile" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    expect(
      await screen.findByText(/Projects and issues are on the web for now|Sign out/),
    ).toBeTruthy();
  });

  it("keeps Change email on when only Resend failed: the code typed may still be right", async () => {
    const api = fakeApi();
    api.answer("POST /api/users/me/email-change", { status: 204 }, "offline");
    api.answer("POST /api/users/me/email-change/confirm", {
      status: 200,
      body: { ...ada, email: "ada@new.example" },
    });
    jest.useFakeTimers();

    await openProfile(api);
    await fireEvent.press(screen.getByRole("button", { name: /Email/ }));
    await fireEvent.changeText(await screen.findByLabelText("New email"), "ada@new.example");
    await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
    await fireEvent.changeText(await screen.findByLabelText("Verification code"), "290415");
    for (let second = 0; second < 60; second++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    await fireEvent.press(screen.getByRole("button", { name: "Resend code" }));
    expect(await screen.findByText(/Can’t reach Nimbus/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change email" })).toBeEnabled();
    jest.useRealTimers();
  });

  it("says when the camera or the library couldn't open", async () => {
    const api = fakeApi();
    (ImagePicker.launchCameraAsync as jest.Mock).mockRejectedValueOnce(new Error("No camera"));

    await openProfile(api);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Take photo" }));

    expect(await screen.findByText("Couldn't open the camera. Please try again.")).toBeTruthy();
  });

  it("says the photo was removed even when reading the User again fails", async () => {
    const api = fakeApi();
    api.answer("DELETE /api/users/me/profile-picture", { status: 204 });

    await openProfile(api, withPictures);
    api.answer("GET /api/users/me", "offline");
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Remove photo" }));

    expect(await screen.findByText("Profile picture updated")).toBeTruthy();
    expect(screen.queryByText(/Couldn't remove your photo/)).toBeNull();
  });

  it("sends nothing when the name wasn't changed, even from the keyboard", async () => {
    const api = fakeApi();

    await openProfile(api);
    await fireEvent.press(screen.getByRole("button", { name: /Display name/ }));
    await fireEvent(await screen.findByLabelText("Display name"), "submitEditing");

    expect(api.to("PATCH /api/users/me")).toHaveLength(0);
  });

  it("takes the type from the file name when the picker gives none", async () => {
    const api = fakeApi();
    photoPicked("library", { mimeType: undefined, fileName: "IMG_0001.HEIC" });

    await openProfile(api);
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));

    expect(await screen.findByText(WRONG_FILE)).toBeTruthy();
    expect(api.to("PUT /api/users/me/profile-picture")).toHaveLength(0);
  });

  it("drops the upload limit's message once the wait is over", async () => {
    const api = fakeApi();
    api.answer("PUT /api/users/me/profile-picture", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
    photoPicked("library", {});

    await openProfile(api);
    jest.useFakeTimers();
    await openPictureSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));
    expect(await screen.findByText(uploadLimitMessage(60))).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(screen.queryByText(uploadLimitMessage(60))).toBeNull();
    jest.useRealTimers();
  });
});
