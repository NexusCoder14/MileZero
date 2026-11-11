import type { ComponentHealth } from "@milezero/shared";

/** Generic reachability probe: any HTTP response below 500 means the service answered. */
export async function probeHttp(url: string | undefined, timeoutMs = 2500): Promise<ComponentHealth> {
  if (!url) return { status: "not_configured", detail: "No URL configured" };
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    const latencyMs = Date.now() - started;
    return res.status < 500
      ? { status: "ok", latencyMs, detail: `HTTP ${res.status}` }
      : { status: "down", latencyMs, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { status: "down", detail: (e as Error).name === "TimeoutError" ? "Timed out" : "Not reachable" };
  }
}
