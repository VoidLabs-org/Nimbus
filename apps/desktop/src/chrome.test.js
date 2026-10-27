import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appIconFile,
  isDevLaunch,
  menuPosition,
  menuTemplate,
  overlayColors,
  windowChrome,
} from "./chrome.js";

/** The roles in a menu template, nested menus as arrays, so a test reads like the menu. */
function roles(items) {
  return items.map((item) =>
    item.submenu ? [item.label, roles(item.submenu)] : (item.role ?? item.type),
  );
}

describe("windowChrome", () => {
  it("never lets the window get smaller than 800×560", () => {
    for (const platform of ["darwin", "win32", "linux"]) {
      const chrome = windowChrome(platform, "light");
      assert.equal(chrome.minWidth, 800, platform);
      assert.equal(chrome.minHeight, 560, platform);
    }
  });

  it("hides the title bar on macOS, keeping the traffic lights, inset", () => {
    const chrome = windowChrome("darwin", "light");
    assert.equal(chrome.titleBarStyle, "hidden");
    assert.deepEqual(chrome.trafficLightPosition, { x: 14, y: 17 });
    assert.equal(chrome.titleBarOverlay, undefined);
  });

  it("hides the title bar on Windows, the OS drawing its buttons over the title row", () => {
    const chrome = windowChrome("win32", "dark");
    assert.equal(chrome.titleBarStyle, "hidden");
    assert.deepEqual(chrome.titleBarOverlay, overlayColors("dark"));
  });

  it("keeps the native frame on Linux", () => {
    const chrome = windowChrome("linux", "light");
    assert.equal(chrome.titleBarStyle, undefined);
    assert.equal(chrome.titleBarOverlay, undefined);
  });
});

describe("overlayColors", () => {
  it("lets the title row show through, with symbols that show up on the theme", () => {
    assert.deepEqual(overlayColors("light"), {
      color: "#00000000",
      symbolColor: "#201d1a",
      height: 46,
    });
    assert.equal(overlayColors("dark").symbolColor, "#f3eee8");
  });
});

describe("menuTemplate", () => {
  const view = ["resetZoom", "zoomIn", "zoomOut", "separator", "togglefullscreen"];
  const devTools = ["separator", "reload", "forceReload", "toggleDevTools"];

  it("is minimal on macOS: the app, Edit, View and Window", () => {
    assert.deepEqual(roles(menuTemplate("darwin", false)), [
      "appMenu",
      "editMenu",
      ["View", view],
      "windowMenu",
    ]);
  });

  it("has Edit, View and Window on Windows and Linux, for their shortcuts and the Nimbus icon's menu", () => {
    for (const platform of ["win32", "linux"]) {
      assert.deepEqual(roles(menuTemplate(platform, false)), [
        "editMenu",
        ["View", view],
        ["Window", ["minimize", "close"]],
      ]);
    }
  });

  it("leaves Ctrl W to the page on Windows and Linux, which closes a Tab with it", () => {
    for (const platform of ["win32", "linux"]) {
      const windowMenu = menuTemplate(platform, false).find((item) => item.label === "Window");
      const close = windowMenu.submenu.find((item) => item.role === "close");
      assert.equal(close.accelerator, "Ctrl+Shift+W", platform);
    }
  });

  it("reloads and opens developer tools only for development", () => {
    for (const platform of ["darwin", "win32", "linux"]) {
      const viewMenu = menuTemplate(platform, true).find((item) => item.label === "View");
      assert.deepEqual(roles(viewMenu.submenu), [...view, ...devTools], platform);
    }
  });
});

describe("menuPosition", () => {
  it("takes whole pixels inside the window", () => {
    assert.deepEqual(menuPosition({ x: 12.4, y: 40.6 }), { x: 12, y: 41 });
    assert.deepEqual(menuPosition({ x: 0, y: 0 }), { x: 0, y: 0 });
  });

  it("refuses anything else", () => {
    for (const value of [
      null,
      undefined,
      "12,40",
      { x: 1 },
      { x: "1", y: 2 },
      { x: NaN, y: 2 },
      { x: -1, y: 2 },
    ]) {
      assert.equal(menuPosition(value), null, JSON.stringify(value));
    }
  });
});

describe("isDevLaunch", () => {
  it("is on only with --dev", () => {
    assert.equal(isDevLaunch(["electron", ".", "--dev"]), true);
    assert.equal(isDevLaunch(["electron", "."]), false);
  });
});

describe("appIconFile", () => {
  it("shows the dark Nimbus mark on a light taskbar or Dock, and the light one on a dark", () => {
    assert.equal(appIconFile("light"), "nimbus-icon-light.png");
    assert.equal(appIconFile("dark"), "nimbus-icon-dark.png");
  });
});
