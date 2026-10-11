// Readiness probe: exits once the Vite dev server responds, so tasks that need it (Electron) can start.
const url = "http://localhost:3000";
const deadline = Date.now() + 60_000;

while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
    if (response.ok) {
      console.log(`Web is ready at ${url}`);
      process.exit(0);
    }
  } catch {
    // Dev server may still be starting. Try again until the deadline.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.error(`Web did not become ready at ${url} within 60 seconds`);
process.exit(1);
