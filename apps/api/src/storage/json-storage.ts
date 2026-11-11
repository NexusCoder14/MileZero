import { z } from "zod";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { IStorageEngine } from "./interface.js";

/**
 * JsonFileStorage:
 * - Persists data as JSON files under dataDir
 * - Per-file async write mutex queue (preventing concurrent write corruption)
 * - Atomic write: write to temp file, fsync, atomic rename
 * - Schema validation with Zod on every read
 * - Automatic backup of previous version (.bak)
 * - Append-only audit log in JSON Lines (.jsonl)
 */
export class JsonFileStorage implements IStorageEngine {
  private dataDir: string;
  private queues: Map<string, Promise<unknown>> = new Map();

  constructor(dataDir: string) {
    this.dataDir = path.resolve(dataDir);
    if (!fsSync.existsSync(this.dataDir)) {
      fsSync.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private getQueue(key: string): Promise<unknown> {
    return this.queues.get(key) || Promise.resolve();
  }

  private enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.getQueue(key);
    const next = prev.then(task, task);
    this.queues.set(key, next);
    next.finally(() => {
      if (this.queues.get(key) === next) {
        this.queues.delete(key);
      }
    });
    return next;
  }

  async read<T>(filename: string, schema: z.ZodType<T>, fallbackDefault: T): Promise<T> {
    const filePath = path.join(this.dataDir, filename);
    try {
      const text = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(text);
      return schema.parse(parsed);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "ENOENT") {
        // File does not exist yet; initialize it atomically with fallbackDefault
        await this.write(filename, fallbackDefault, schema);
        return fallbackDefault;
      }
      // If primary file is corrupted, check if a backup exists
      const bakPath = filePath + ".bak";
      if (fsSync.existsSync(bakPath)) {
        try {
          const bakText = await fs.readFile(bakPath, "utf8");
          const bakParsed = JSON.parse(bakText);
          const validated = schema.parse(bakParsed);
          // Recover primary from backup
          await this.write(filename, validated, schema);
          return validated;
        } catch {
          // Backup also corrupted or unparseable
        }
      }
      throw err;
    }
  }

  async write<T>(filename: string, data: T, schema: z.ZodType<T>): Promise<void> {
    const validated = schema.parse(data);
    const filePath = path.join(this.dataDir, filename);
    const tmpPath = filePath + ".tmp." + Math.random().toString(36).slice(2);
    const bakPath = filePath + ".bak";

    return this.enqueue(filename, async () => {
      const json = JSON.stringify(validated, null, 2);
      // 1. Write to temp file
      const handle = await fs.open(tmpPath, "w");
      try {
        await handle.writeFile(json, "utf8");
        await handle.sync(); // fsync
      } finally {
        await handle.close();
      }

      // 2. Backup existing file if present
      if (fsSync.existsSync(filePath)) {
        try {
          await fs.copyFile(filePath, bakPath);
        } catch {
          // ignore backup errors
        }
      }

      // 3. Atomic rename
      await fs.rename(tmpPath, filePath);
    });
  }

  async update<T>(
    filename: string,
    schema: z.ZodType<T>,
    fallbackDefault: T,
    updater: (curr: T) => T | Promise<T>
  ): Promise<T> {
    return this.enqueue(filename, async () => {
      let current: T;
      const filePath = path.join(this.dataDir, filename);
      try {
        const text = await fs.readFile(filePath, "utf8");
        current = schema.parse(JSON.parse(text));
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === "ENOENT") {
          current = fallbackDefault;
        } else {
          throw err;
        }
      }

      const updated = await updater(current);
      const validated = schema.parse(updated);

      const tmpPath = filePath + ".tmp." + Math.random().toString(36).slice(2);
      const bakPath = filePath + ".bak";

      const handle = await fs.open(tmpPath, "w");
      try {
        await handle.writeFile(JSON.stringify(validated, null, 2), "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }

      if (fsSync.existsSync(filePath)) {
        try {
          await fs.copyFile(filePath, bakPath);
        } catch {
          // ignore
        }
      }

      await fs.rename(tmpPath, filePath);
      return validated;
    });
  }

  async appendAudit(entry: Record<string, unknown>): Promise<void> {
    const auditPath = path.join(this.dataDir, "audit.jsonl");
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n";
    return this.enqueue("audit.jsonl", async () => {
      const handle = await fs.open(auditPath, "a");
      try {
        await handle.writeFile(line, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    });
  }
}

