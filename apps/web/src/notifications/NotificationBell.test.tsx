// @vitest-environment jsdom
import { MantineProvider, Popover } from "@mantine/core";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { api, type NotificationItem } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { NotificationBell } from "./NotificationBell";

let restoreMedia: () => void;
beforeEach(() => {
  restoreMedia = stubMatchMedia();
});
afterEach(() => {
  cleanup();
  restoreMedia();
  vi.restoreAllMocks();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

function drawBell() {
  const client = createQueryClient();
  render(
    <MantineProvider
      env="test"
      theme={{ components: { Popover: Popover.extend({ defaultProps: { hideDetached: false } }) } }}
    >
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotificationBell position="bottom-end" />
          <Location />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
  return client;
}

it("caps the bell badge and explains an empty inbox", async () => {
  vi.spyOn(api, "notificationUnreadCount").mockResolvedValue({ count: 12 });
  vi.spyOn(api, "notifications").mockResolvedValue({ items: [], nextCursor: null });
  render(
    <MantineProvider
      env="test"
      theme={{ components: { Popover: Popover.extend({ defaultProps: { hideDetached: false } }) } }}
    >
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <NotificationBell position="bottom-end" />
          <Location />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
  const bell = await screen.findByRole("button", { name: "Notifications, 12 unread" });
  expect(bell.textContent).toContain("9+");
  fireEvent.click(bell);
  expect(await screen.findByText("You're all caught up")).toBeTruthy();
  expect(screen.getByText(/an Issue you reported or are assigned to changes/)).toBeTruthy();
  expect(screen.getByText("Kept for 90 days")).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Email settings" }));
  expect(screen.getByTestId("location").textContent).toBe("/settings/notifications");
});

it("groups Security alerts by day, loads older rows, and marks a row read before opening Security", async () => {
  vi.spyOn(api, "notificationUnreadCount").mockResolvedValue({ count: 1 });
  const read = vi.spyOn(api, "readNotification").mockResolvedValue(undefined);
  const today = new Date().toISOString();
  vi.spyOn(api, "notifications").mockImplementation(async (cursor) => ({
    items: [
      {
        id: cursor ? "older" : "new",
        type: "SIGNED_IN",
        createdAt: cursor ? "2025-01-01T08:00:00Z" : today,
        read: !!cursor,
        snapshot: {
          title: "New sign-in to your account",
          deviceLabel: cursor ? "Firefox on Linux" : "Safari on iPhone",
        },
        link: "/settings/security",
      },
    ],
    nextCursor: cursor ? null : "older-cursor",
  }));
  drawBell();
  fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
  const row = await screen.findByRole("button", {
    name: /New sign-in to your account.*Safari on iPhone/,
  });
  expect(screen.getByText("Today")).toBeTruthy();
  expect(row.getAttribute("data-unread")).toBe("true");
  fireEvent.scroll(screen.getByRole("region", { name: "Notification list" }));
  expect(await screen.findByText("Firefox on Linux")).toBeTruthy();
  fireEvent.click(row);
  await waitFor(() => expect(read).toHaveBeenCalledWith("new"));
  await waitFor(() =>
    expect(screen.getByTestId("location").textContent).toBe("/settings/security"),
  );
});

it("shows the other Security alerts with their detail and opens Security on click", async () => {
  vi.spyOn(api, "notificationUnreadCount").mockResolvedValue({ count: 4 });
  vi.spyOn(api, "readNotification").mockResolvedValue(undefined);
  const at = new Date().toISOString();
  const alert = (id: string, type: NotificationItem["type"], title: string, detail: string) => ({
    id,
    type,
    createdAt: at,
    read: false,
    snapshot: { title, detail },
    link: "/settings/security",
  });
  vi.spyOn(api, "notifications").mockResolvedValue({
    items: [
      alert("p", "PASSWORD_CHANGED", "Password changed", "If this wasn't you, reset it now."),
      alert(
        "c",
        "LINKED_IDENTITY_CONNECTED",
        "Google connected",
        "ada@gmail.com can now be used to sign in.",
      ),
      alert(
        "d",
        "LINKED_IDENTITY_DISCONNECTED",
        "GitHub disconnected",
        "It can no longer be used to sign in.",
      ),
      alert(
        "o",
        "OTHER_SESSIONS_SIGNED_OUT",
        "Signed out of other devices",
        "If this wasn't you, change your password now.",
      ),
    ],
    nextCursor: null,
  });
  drawBell();
  fireEvent.click(await screen.findByRole("button", { name: "Notifications, 4 unread" }));

  const row = await screen.findByRole("button", {
    name: /Password changed.*If this wasn't you, reset it now\./,
  });
  expect(screen.getByText("ada@gmail.com can now be used to sign in.")).toBeTruthy();
  expect(screen.getByText("It can no longer be used to sign in.")).toBeTruthy();
  expect(screen.getByText("If this wasn't you, change your password now.")).toBeTruthy();
  fireEvent.click(row);
  await waitFor(() =>
    expect(screen.getByTestId("location").textContent).toBe("/settings/security"),
  );
});

it("refreshes the badge every thirty seconds and when focus returns", async () => {
  vi.useFakeTimers();
  focusManager.setFocused(true);
  const count = vi.spyOn(api, "notificationUnreadCount").mockResolvedValue({ count: 2 });
  drawBell();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  count.mockResolvedValue({ count: 3 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_001);
  });
  expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toBeTruthy();
  count.mockResolvedValue({ count: 4 });
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole("button", { name: "Notifications, 4 unread" })).toBeTruthy();
});

it("marks all Notifications as read and refreshes the badge", async () => {
  const count = vi.spyOn(api, "notificationUnreadCount").mockResolvedValue({ count: 2 });
  vi.spyOn(api, "notifications").mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(api, "readAllNotifications").mockImplementation(async () => {
    count.mockResolvedValue({ count: 0 });
  });
  drawBell();
  fireEvent.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
  fireEvent.click(await screen.findByRole("button", { name: "Mark all as read" }));
  await screen.findByRole("button", { name: "Notifications, 0 unread" });
});

it("refreshes the first page when reopening a panel that had loaded older rows", async () => {
  vi.spyOn(api, "notificationUnreadCount").mockResolvedValue({ count: 0 });
  const load = vi
    .spyOn(api, "notifications")
    .mockImplementation(async (cursor) => ({ items: [], nextCursor: cursor ? null : "older" }));
  drawBell();
  const bell = await screen.findByRole("button", { name: "Notifications, 0 unread" });
  fireEvent.click(bell);
  fireEvent.click(await screen.findByRole("button", { name: "Load older Notifications" }));
  await waitFor(() => expect(load).toHaveBeenCalledWith("older"));
  fireEvent.click(bell);
  load.mockClear();
  fireEvent.click(bell);
  await waitFor(() => expect(load).toHaveBeenCalledWith(undefined));
  expect(load).toHaveBeenCalledTimes(1);
});

it("opens a dismissible sheet on phones", async () => {
  const original = window.matchMedia;
  window.matchMedia = (query) => ({
    ...original(query),
    matches: query.includes("max-width: 48em"),
  });
  vi.spyOn(api, "notificationUnreadCount").mockResolvedValue({ count: 0 });
  vi.spyOn(api, "notifications").mockResolvedValue({ items: [], nextCursor: null });
  drawBell();
  fireEvent.click(await screen.findByRole("button", { name: "Notifications, 0 unread" }));
  expect(await screen.findByRole("dialog", { name: "Notifications" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close Notifications" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
