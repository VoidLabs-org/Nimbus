// Runs the Gradle wrapper on any OS, so package.json scripts work for everyone.
import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const result = spawnSync(
  isWindows ? "gradlew.bat" : "./gradlew",
  ["--console=plain", ...process.argv.slice(2)],
  { stdio: "inherit", shell: isWindows },
);

process.exit(result.status ?? 1);
