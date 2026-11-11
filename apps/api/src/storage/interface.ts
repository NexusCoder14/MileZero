import { z } from "zod";

export interface IStorageEngine {
  read<T>(filename: string, schema: z.ZodType<T>, fallbackDefault: T): Promise<T>;
  write<T>(filename: string, data: T, schema: z.ZodType<T>): Promise<void>;
  update<T>(filename: string, schema: z.ZodType<T>, fallbackDefault: T, updater: (curr: T) => T | Promise<T>): Promise<T>;
  appendAudit(entry: Record<string, unknown>): Promise<void>;
}

