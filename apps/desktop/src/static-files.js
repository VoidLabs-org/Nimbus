import path from "node:path";

/**
 * Which file of the built web app an app://nimbus path is. Page routes (no file extension) get index.html, so the
 * app's own router takes over.
 *
 * @param {string} distDir the built web app
 * @param {string} pathname the URL's path
 * @returns {{ file: string } | { error: string }}
 */
export function resolveWebFile(distDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { error: "Bad request" };
  }
  const filePath = path.resolve(distDir, `.${decoded}`);
  const relative = path.relative(distDir, filePath);
  // Block paths that escape the dist folder, e.g. app://nimbus/../../secret.txt
  if (relative.startsWith("..") || path.isAbsolute(relative)) return { error: "Bad request" };
  return { file: path.extname(filePath) ? filePath : path.join(distDir, "index.html") };
}
