import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Loads the repository's .env (if present) without overriding variables already set. */
export function loadDotEnv(): void {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
  if (existsSync(file)) process.loadEnvFile(file);
}
