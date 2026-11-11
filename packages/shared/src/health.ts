import { z } from "zod";

/**
 * "not_configured": nothing has been set up. "unverified": a credential or URL is present but
 * no successful live check has happened yet. Only "ok" means a real check succeeded.
 */
export const ComponentStatus = z.enum(["ok", "down", "not_configured", "unverified"]);
export type ComponentStatus = z.infer<typeof ComponentStatus>;

export const ComponentHealth = z.object({
  status: ComponentStatus,
  detail: z.string().optional(),
  latencyMs: z.number().nonnegative().optional(),
});
export type ComponentHealth = z.infer<typeof ComponentHealth>;

export const HealthComponentsSchema = z.object({
  storage: ComponentHealth,
  streetRouting: ComponentHealth,
  geocoder: ComponentHealth,
  transit: ComponentHealth,
  fareResearch: ComponentHealth,
});
export type HealthComponents = z.infer<typeof HealthComponentsSchema>;

export const HealthResponse = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  service: z.literal("milezero-api"),
  version: z.string(),
  time: z.string(),
  components: HealthComponentsSchema,
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Overall status: down if storage is down, degraded if anything else is not ok. */
export function overallStatus(c: HealthComponents): HealthResponse["status"] {
  if (c.storage.status === "down") return "down";
  const checks = [c.storage, c.streetRouting, c.geocoder, c.transit, c.fareResearch];
  return checks.every((x) => x.status === "ok") ? "ok" : "degraded";
}

/** The only labels allowed when describing delivery status of a feature. */
export const FEATURE_STATUS = [
  "Implemented and verified",
  "Implemented but awaiting external data or credentials",
  "Not implemented",
] as const;
export type FeatureStatus = (typeof FEATURE_STATUS)[number];
