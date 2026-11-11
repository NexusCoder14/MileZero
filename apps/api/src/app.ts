import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import { JsonFileStorage } from "./storage/index.js";
import { GeocoderService } from "./routing/geocoder.js";
import { RoutingService } from "./routing/router.js";
import { OsmTransitNetwork } from "./transit/osm-transit.js";

import { registerHealthRoutes } from "./routes/health.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerPlannerRoutes } from "./routes/planner.js";
import { registerCommunityRoutes } from "./routes/community.js";
import { registerAdminRoutes } from "./routes/admin.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function tileOrigin(template: string | undefined): string | null {
  if (!template) return null;
  try {
    const origin = new URL(template.replace(/\{[a-z]\}/g, "a")).origin;
    if (origin.includes("openstreetmap.fr")) {
      return "https://*.tile.openstreetmap.fr";
    }
    if (origin.includes("cartocdn.com")) {
      return "https://*.basemaps.cartocdn.com";
    }
    return origin;
  } catch {
    return null;
  }
}

export async function buildApp(cfg: Config, storage?: JsonFileStorage): Promise<FastifyInstance> {
  const store = storage || new JsonFileStorage(cfg.DATA_DIR);
  const geocoder = new GeocoderService(cfg.GEOCODER_URL);
  const router = new RoutingService(cfg.ROUTING_ENGINE_URL);
  const transitNetwork = new OsmTransitNetwork(cfg.DATA_DIR, cfg.OVERPASS_URL);
  transitNetwork.start(cfg.NODE_ENV !== "test");

  const app = Fastify({
    logger:
      cfg.NODE_ENV === "test"
        ? false
        : {
            level: cfg.NODE_ENV === "production" ? "info" : "debug",
            redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
          },
    trustProxy: cfg.TRUST_PROXY,
    bodyLimit: 1_048_576,
  });
  app.addHook("onClose", async () => transitNetwork.stop());

  const tiles = tileOrigin(cfg.TILE_URL_TEMPLATE);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", ...(tiles ? [tiles] : [])],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: [cfg.PUBLIC_ORIGIN],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  await app.register(cookie, { secret: cfg.SESSION_SECRET });
  await app.register(rateLimit, { max: cfg.RATE_LIMIT_MAX, timeWindow: "1 minute" });

  // Uniform error shape: { error: { code, message } }
  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err }, "request failed");
      return reply.code(status).send({ error: { code: "INTERNAL", message: "Something went wrong on our side." } });
    }
    const code =
      status === 429
        ? "RATE_LIMITED"
        : /^[A-Z0-9_]+$/.test(err.code ?? "") && !err.code!.startsWith("FST_")
          ? err.code!
          : "BAD_REQUEST";
    return reply.code(status).send({ error: { code, message: err.message } });
  });

  // Register All Route Modules
  registerHealthRoutes(app, cfg, transitNetwork);
  registerAuthRoutes(app, store);
  registerPlannerRoutes(app, {
    geocoder,
    router,
    transitNetwork,
    storage: store,
    sessionSecret: cfg.SESSION_SECRET,
  });
  registerCommunityRoutes(app, store, cfg.SESSION_SECRET);
  registerAdminRoutes(app, store, cfg.DATA_DIR, cfg.GROQ_API_KEY, transitNetwork);

  // Production: serve built React app
  const webDist = cfg.WEB_DIST ?? path.resolve(here, "../../web/dist");
  const notFoundJson = { error: { code: "NOT_FOUND", message: "No such endpoint." } };

  if (existsSync(path.join(webDist, "index.html"))) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      setHeaders: (reply, filePath) => {
        reply.header(
          "cache-control",
          filePath.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache"
        );
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const pathname = req.url.split("?")[0] ?? "/";
      const isPage =
        (req.method === "GET" || req.method === "HEAD") &&
        !pathname.startsWith("/api/") &&
        !/\.[a-z0-9]+$/i.test(pathname);
      return isPage ? reply.header("cache-control", "no-cache").sendFile("index.html") : reply.code(404).send(notFoundJson);
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send(notFoundJson));
  }

  return app;
}
