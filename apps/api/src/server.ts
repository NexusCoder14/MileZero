import { loadDotEnv } from "./env.js";
loadDotEnv();
import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";

let cfg: ReturnType<typeof loadConfig>;
try {
  cfg = loadConfig();
} catch (e) {
  console.error((e as Error).message);
  console.error("Fix your .env (see .env.example) and start again.");
  process.exit(1);
}

const app = await buildApp(cfg);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  app.log.info(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    await app.close();
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: cfg.API_HOST, port: cfg.API_PORT });
