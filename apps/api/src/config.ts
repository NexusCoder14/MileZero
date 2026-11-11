import { z } from "zod";

const blank = z.string().optional().transform((v) => (v && v.trim() ? v.trim() : undefined));

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default(process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(process.env.PORT ? parseInt(process.env.PORT, 10) : 4000),
  PUBLIC_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
  DATA_DIR: z.string().default("./data"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  TILE_URL_TEMPLATE: z
    .string()
    .default("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png"),
  TILE_ATTRIBUTION: z
    .string()
    .default('&copy; OpenStreetMap France | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'),
  GEOCODER_URL: z.string().default("https://nominatim.openstreetmap.org"),
  ROUTING_ENGINE_URL: z
    .string()
    .default("https://routing.openstreetmap.de/routed-{profile}"),
  OVERPASS_URL: z.string().url().default("https://overpass-api.de/api/interpreter"),
  GROQ_API_KEY: blank,
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  GROQ_BASE_URL: z.string().url().default("https://api.groq.com/openai/v1"),
  TRUST_PROXY: z.enum(["true", "false"]).default(process.env.NODE_ENV === "production" ? "true" : "false").transform((v) => v === "true"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(240),
  WEB_DIST: blank,
  OPERATOR_NAME: blank,
  JURISDICTION: blank,
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProd = env.NODE_ENV === "production";

  // If Render provides RENDER_EXTERNAL_URL and PUBLIC_ORIGIN is unset or default, use it
  if (env.RENDER_EXTERNAL_URL && (!env.PUBLIC_ORIGIN || env.PUBLIC_ORIGIN === "http://127.0.0.1:5173")) {
    env.PUBLIC_ORIGIN = env.RENDER_EXTERNAL_URL;
  }
  if (env.PORT && !env.API_PORT) {
    env.API_PORT = env.PORT;
  }
  if (isProd && !env.API_HOST) {
    env.API_HOST = "0.0.0.0";
  }
  if (isProd && env.TRUST_PROXY === undefined) {
    env.TRUST_PROXY = "true";
  }

  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error("Invalid environment configuration:\n" + lines.join("\n"));
  }
  const c = parsed.data;
  if (c.NODE_ENV === "production") {
    if (/change-me|replace-with/i.test(c.SESSION_SECRET)) throw new Error("SESSION_SECRET still has its placeholder value");
    if (c.PUBLIC_ORIGIN.startsWith("http://") && !/localhost|127\.0\.0\.1/.test(c.PUBLIC_ORIGIN)) {
      throw new Error("PUBLIC_ORIGIN must be https in production");
    }
  }
  return c;
}
