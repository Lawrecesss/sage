// Runs once when a server process starts (Next.js instrumentation hook). `web` is a long-lived
// container, not a serverless function, so it's where the scheduled 6-hour report lives.
//
// The import must sit inside the NEXT_RUNTIME check (not after an early return): Next replaces
// that variable at build time, which is what keeps `pg` out of the edge bundle of this file.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutoReports } = await import("@/lib/auto-reports");
    startAutoReports();
  }
}
