import { FastifyInstance } from "fastify";
import fs from "node:fs";
import {
  HealthResponse,
  ComponentHealth,
  BRAND,
  overallStatus,
} from "@milezero/shared";
import { Config } from "../config.js";
import { OsmTransitNetwork } from "../transit/osm-transit.js";
import { checkGroq } from "../lib/groq.js";

export function registerHealthRoutes(
  app: FastifyInstance,
  config: Config,
  transitNetwork: OsmTransitNetwork
) {
  // GET /api/health/live
  app.get("/api/health/live", async () => {
    return { ok: true };
  });

  // GET /api/health
  app.get("/api/health", async () => {
    // 1. Storage
    let storageHealth: ComponentHealth;
    try {
      const exists = fs.existsSync(config.DATA_DIR);
      storageHealth = {
        status: exists ? "ok" : "down",
        detail: exists ? "JSON storage directory ready" : "Data directory missing",
      };
    } catch {
      storageHealth = { status: "down", detail: "Failed to access storage" };
    }

    const transit = transitNetwork.status();
    const transitHealth: ComponentHealth =
      transit.state === "estimated_osm"
        ? { status: "ok", detail: `${transit.routeCount} OpenStreetMap routes and ${transit.stopCount} stops loaded; fetched ${transit.fetchedAt}` }
        : { status: transit.state === "error" ? "down" : "not_configured", detail: transit.message };

    // 3. Geocoder
    const geocoderHealth: ComponentHealth = {
      status: config.GEOCODER_URL ? "ok" : "not_configured",
      detail: config.GEOCODER_URL ? "OpenStreetMap Nominatim proxy configured" : "Not configured",
    };

    // 4. Street Router
    const streetRoutingHealth: ComponentHealth = {
      status: config.ROUTING_ENGINE_URL ? "ok" : "not_configured",
      detail: config.ROUTING_ENGINE_URL ? "OSRM street routing configured" : "Not configured",
    };

    // 5. Fare Research (Groq)
    let fareResearchHealth: ComponentHealth;
    if (config.GROQ_API_KEY) {
      const groqRes = await checkGroq({
        GROQ_API_KEY: config.GROQ_API_KEY,
        GROQ_MODEL: config.GROQ_MODEL,
        GROQ_BASE_URL: config.GROQ_BASE_URL,
      });
      fareResearchHealth = {
        status: groqRes.status,
        detail: groqRes.detail,
      };
    } else {
      fareResearchHealth = {
        status: "not_configured",
        detail: "GROQ_API_KEY is not set. Add your key in .env to enable fare research.",
      };
    }

    const components = {
      storage: storageHealth,
      streetRouting: streetRoutingHealth,
      geocoder: geocoderHealth,
      transit: transitHealth,
      fareResearch: fareResearchHealth,
    };

    const overall = overallStatus(components);

    const response: HealthResponse & { transit?: ReturnType<OsmTransitNetwork["status"]> } = {
      status: overall,
      service: "milezero-api",
      version: "0.1.0",
      time: new Date().toISOString(),
      components,
      transit,
    };

    return response;
  });

  app.get("/api/health/transit", async () => transitNetwork.status());

  // GET /api/config - Public client config
  app.get("/api/config", async () => {
    return {
      brand: BRAND,
      tileUrlTemplate: config.TILE_URL_TEMPLATE,
      tileAttribution: config.TILE_ATTRIBUTION,
      operatorName: config.OPERATOR_NAME || "MileZero Operators",
      jurisdiction: config.JURISDICTION || "Maharashtra, India",
    };
  });
}
