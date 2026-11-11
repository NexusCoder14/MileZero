import { z } from "zod";
import { GeoPoint } from "./engine.js";

export const PlanQuerySchema = z.object({
  from: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    name: z.string().optional(),
  }),
  to: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    name: z.string().optional(),
  }),
  preferences: z
    .object({
      weights: z
        .object({
          time: z.number().min(0).max(1).optional(),
          cost: z.number().min(0).max(1).optional(),
          co2: z.number().min(0).max(1).optional(),
        })
        .optional(),
      occupancy: z.number().int().min(1).max(8).optional(),
      parkingFee: z.number().min(0).optional(),
      vehicleId: z.string().optional(),
    })
    .optional(),
});
export type PlanQuery = z.infer<typeof PlanQuerySchema>;

export interface PlanLeg {
  mode: "walk" | "cycle" | "bus" | "metro" | "train" | "car";
  distanceKm: number;
  durationMinutes: number;
  fromName?: string;
  toName?: string;
  line?: string;
  operator?: string;
  stopsCount?: number;
  stopsPassed?: string[];
  scheduledTimes?: {
    departure: string;
    arrival: string;
  };
  geometry?: [number, number][]; // [lat, lon]
  fare?: number | null;
  fareInfo?: {
    label?: string;
    sourceTitle?: string;
    sourceUrl?: string;
    verified?: boolean;
    note?: string;
  } | null;
  estimated?: boolean;
  note?: string;
}

export interface PlanOption {
  id: string;
  mode: "walk" | "cycle" | "transit" | "car";
  label: string;
  distanceKm: number;
  durationMinutes: number;
  cost: number | null;
  costBreakdown?: {
    fare?: number | null;
    fuel?: number;
    parking?: number;
  };
  co2Kg: number;
  legs: PlanLeg[];
  score?: number;
  tags?: string[];
  notices?: string[];
  nudge?: string | null;
  token?: string; // Signed HMAC token for trip logging
  estimated?: boolean;
  note?: string;
}

export interface PlanResult {
  from: { lat: number; lon: number; name?: string };
  to: { lat: number; lon: number; name?: string };
  generatedAt: string;
  options: PlanOption[];
  notices: string[];
  providers?: {
    transit: "estimated_osm" | "empty" | "snapshot_missing" | "refreshing" | "error";
    message: string;
  };
}
