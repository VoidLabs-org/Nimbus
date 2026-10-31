// `pnpm dev`: starts Metro (`expo start`) and keeps the API and the web app reachable from every connected Android
// emulator or phone. Their `localhost` is their own, so `adb reverse` forwards their ports 8080 (the API) and 3000 (the
// web app, where Google and GitHub hand back) to this computer's. The forwarding is lost whenever the device restarts,
// is unplugged or adb restarts, so this checks every few seconds and puts back what is missing. Without adb it says so
// once and only starts Metro.
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const PORTS = [8080, 3000];
const EVERY_MS = 5000;

const adb = findAdb();

/** adb from the Android SDK where Android Studio puts it, or else whatever `adb` is on the PATH. */
function findAdb() {
  const sdk =
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    (process.platform === "win32"
      ? join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk")
      : join(homedir(), process.platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk"));
  const bundled = join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
  return existsSync(bundled) ? bundled : "adb";
}

/** adb's output, or null when it failed (no adb, or the device went away meanwhile). */
function run(args) {
  return new Promise((resolve) => {
    execFile(adb, args, { windowsHide: true }, (error, stdout) => resolve(error ? null : stdout));
  });
}

/** Forwards the ports any connected device is missing. False when adb isn't there at all. */
async function forwardPorts() {
  const devices = await run(["devices"]);
  if (devices === null) return false;
  const serials = devices
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === "device")
    .map(([serial]) => serial);
  for (const serial of serials) {
    const list = (await run(["-s", serial, "reverse", "--list"])) ?? "";
    const missing = PORTS.filter((port) => !list.includes(`tcp:${port} tcp:${port}`));
    if (missing.length === 0) continue;
    for (const port of missing) await run(["-s", serial, "reverse", `tcp:${port}`, `tcp:${port}`]);
    console.log(
      `› ${serial}: localhost:${missing.join(" and :")} now reach this computer (adb reverse)`,
    );
  }
  return true;
}

// Expo's CLI run with this Node, so no shell is needed for Windows' .cmd launchers.
const expoCli = createRequire(import.meta.url).resolve("expo/bin/cli");
const metro = spawn(process.execPath, [expoCli, "start", ...process.argv.slice(2)], {
  stdio: "inherit",
});
metro.on("exit", (code) => process.exit(code ?? 0));

if (await forwardPorts()) {
  setInterval(() => void forwardPorts(), EVERY_MS).unref();
} else {
  console.log(
    "› adb not found: Android emulators and phones won't reach the API. Install Android Studio, or run adb reverse " +
      "yourself (apps/mobile/README.md).",
  );
}
