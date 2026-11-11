import type { ComponentHealth } from "@milezero/shared";
import type { Config } from "../config.js";

interface Cached { at: number; value: ComponentHealth }
let cache: Cached | null = null;
const OK_TTL_MS = 10 * 60_000;   // a good result is reused, so health checks do not hammer Groq
const BAD_TTL_MS = 60_000;       // a failure is retried soon

export function resetGroqCache() { cache = null; }

/**
 * Checks, with one real request to the Groq API, that the key is accepted and that the configured
 * model is available to it. The key is sent only as a bearer header and never logged or returned.
 */
export async function checkGroq(cfg: Pick<Config, "GROQ_API_KEY" | "GROQ_MODEL" | "GROQ_BASE_URL">, timeoutMs = 5000): Promise<ComponentHealth> {
  if (!cfg.GROQ_API_KEY) return { status: "not_configured", detail: "No research credential configured" };
  if (cache && Date.now() - cache.at < (cache.value.status === "ok" ? OK_TTL_MS : BAD_TTL_MS)) return cache.value;
  const started = Date.now();
  let value: ComponentHealth;
  try {
    const res = await fetch(`${cfg.GROQ_BASE_URL.replace(/\/$/, "")}/models`, {
      headers: { authorization: `Bearer ${cfg.GROQ_API_KEY}`, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error"
    });
    const latencyMs = Date.now() - started;
    if (res.status === 401 || res.status === 403) value = { status: "down", latencyMs, detail: "Groq rejected the API key" };
    else if (res.status === 429) value = { status: "unverified", latencyMs, detail: "Groq is rate limiting this key, will retry" };
    else if (!res.ok) value = { status: "down", latencyMs, detail: `Groq answered HTTP ${res.status}` };
    else {
      const body = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown }> } | null;
      const ids = Array.isArray(body?.data) ? body!.data!.map((m) => String(m.id)) : null;
      if (!ids) value = { status: "down", latencyMs, detail: "Groq sent a response this service does not understand" };
      else if (!ids.includes(cfg.GROQ_MODEL)) value = { status: "down", latencyMs, detail: `Key works, but model ${cfg.GROQ_MODEL} is not available to it. Set GROQ_MODEL to a listed model.` };
      else value = { status: "ok", latencyMs, detail: `Key accepted, model ${cfg.GROQ_MODEL} available` };
    }
  } catch (e) {
    const name = (e as Error).name;
    value = name === "TimeoutError" ? { status: "unverified", detail: "Groq did not answer in time, will retry" } : { status: "down", detail: "Groq is not reachable from this server" };
  }
  cache = { at: Date.now(), value };
  return value;
}
