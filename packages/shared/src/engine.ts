import { FareScheme, Beyond, CityRates } from "./rates.js";
import { FACTORS, VehicleFactor } from "./factors.js";

export const EARTH_KM = 6371.0088;

export interface GeoPoint {
  lat: number;
  lon: number;
}

export function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversine(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s));
}

export function round(v: number, decimals: number = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}

/**
 * Deterministically compute slab fare.
 * slabs is an array of [upToKm | null, fare] sorted by km ascending.
 */
export function slabFare(scheme: { slabs: [number | null, number][]; beyond?: Beyond }, km: number): number | null {
  if (km == null || !isFinite(km) || km < 0) return null;
  const slabs = scheme.slabs;
  if (!slabs || slabs.length === 0) return null;

  for (let i = 0; i < slabs.length; i++) {
    const item = slabs[i];
    if (!item) continue;
    const [upTo, fare] = item;
    if (upTo === null || km <= upTo) {
      return fare;
    }
  }

  // If beyond exists and km exceeds last finite slab
  if (scheme.beyond && slabs.length > 0) {
    const last = slabs[slabs.length - 1];
    if (last) {
      const baseKm = last[0] ?? 0;
      const baseFare = last[1];
      const extraKm = km - baseKm;
      if (extraKm <= 0) return baseFare;
      const steps = Math.ceil(extraKm / scheme.beyond.stepKm);
      return baseFare + steps * scheme.beyond.stepFare;
    }
  }

  return null;
}

/**
 * Pick matching fare scheme by route text regex matching.
 */
export function pickScheme(
  schemes: FareScheme[],
  routeText: string
): { scheme: FareScheme; alt?: FareScheme; matched: boolean } | null {
  if (!schemes || schemes.length === 0) return null;

  // 1. Try matching schemes with a regex match string
  for (const s of schemes) {
    if (s.match) {
      try {
        const re = new RegExp(s.match, "i");
        if (re.test(routeText)) {
          const alt = s.alternativeTo ? schemes.find((x) => x.id === s.alternativeTo) : undefined;
          return { scheme: s, alt, matched: true };
        }
      } catch {
        // invalid regex in scheme ignored
      }
    }
  }

  // 2. Default scheme
  const def = schemes.find((s) => s.role === "default" && !s.match) || schemes[0];
  if (!def) return null;
  const alt = schemes.find((s) => s.role === "alternative" && s.alternativeTo === def.id);
  return { scheme: def, alt, matched: false };
}

export interface ResolvedFare {
  amount: number | null;
  info: {
    label: string;
    asOf?: string;
    sourceUrl?: string;
    sourceTitle?: string;
    verified?: boolean;
    note?: string;
    custom?: boolean;
    altLabel?: string;
    altAmount?: number;
    matched?: boolean;
  } | null;
}

export function resolveTransitFare(
  cityRates: CityRates | null | undefined,
  mode: string,
  routeText: string,
  km: number,
  customFareOverride?: { base?: number; perKm?: number } | null
): ResolvedFare {
  if (customFareOverride && (customFareOverride.base != null || customFareOverride.perKm != null)) {
    const amt = (customFareOverride.base || 0) + (customFareOverride.perKm || 0) * km;
    return { amount: amt, info: { label: "Custom fare override", custom: true } };
  }

  const list = cityRates?.fares?.[mode];
  if (!list || list.length === 0) {
    return { amount: null, info: null };
  }

  const picked = pickScheme(list, routeText);
  if (!picked) return { amount: null, info: null };

  const amt = slabFare(picked.scheme, km);
  if (amt == null) return { amount: null, info: null };

  const s = picked.scheme;
  const info: ResolvedFare["info"] = {
    label: s.label,
    asOf: s.asOf,
    sourceUrl: s.source?.url,
    sourceTitle: s.source?.title,
    verified: s.verified,
    note: s.note,
    matched: picked.matched,
  };

  if (picked.alt) {
    const altAmt = slabFare(picked.alt, km);
    if (altAmt != null) {
      info.altLabel = picked.alt.label;
      info.altAmount = altAmt;
    }
  }

  return { amount: amt, info };
}

/**
 * Calculate driving fuel cost and CO2
 */
export function calculateDriving(params: {
  distanceKm: number;
  durationMinutes: number;
  vehicle?: VehicleFactor;
  occupancy?: number;
  petrolPricePerL?: number;
  parkingFee?: number;
}): {
  co2Kg: number;
  fuelCost: number;
  totalCost: number;
  kmPerL: number;
  occupancy: number;
  co2PerVehicleKm: number;
} {
  const veh = params.vehicle || FACTORS.vehicles[0] || {
    id: "default",
    label: "Standard petrol car",
    kgPerKm: 0.14,
    kmPerL: 16.0,
  };
  const occ = Math.max(1, Math.round(params.occupancy || 1));
  const petrolPrice = params.petrolPricePerL ?? FACTORS.fuel.petrolPricePerL;
  const parking = Math.max(0, params.parkingFee || 0);

  // CO2 = distance * factor / occupancy
  const co2Kg = (params.distanceKm * veh.kgPerKm) / occ;
  // Fuel = distance / kmPerL * petrolPrice
  const fuelCost = (params.distanceKm / veh.kmPerL) * petrolPrice;
  const totalCost = fuelCost + parking;

  return {
    co2Kg: round(co2Kg, 3),
    fuelCost: round(fuelCost, 2),
    totalCost: round(totalCost, 2),
    kmPerL: veh.kmPerL,
    occupancy: occ,
    co2PerVehicleKm: veh.kgPerKm,
  };
}

/**
 * Calculate Transit CO2
 */
export function calculateTransitCO2(mode: "bus" | "metro" | "train", distanceKm: number): number {
  const factor = FACTORS.transit[mode]?.kgPerPkm || 0;
  return round(distanceKm * factor, 3);
}

/**
 * Min-max scoring engine
 */
export interface ScoredOption {
  id: string;
  mode: string;
  durationMinutes: number;
  cost: number | null;
  co2Kg: number;
  score?: number;
  tags?: string[];
}

export function rankOptions<T extends ScoredOption>(
  options: T[],
  weights: { time?: number; cost?: number; co2?: number } = { time: 0.4, cost: 0.3, co2: 0.3 }
): T[] {
  if (options.length === 0) return [];
  if (options.length === 1) {
    const single = options[0];
    return [{ ...single, score: 1.0, tags: ["Best option"] } as T];
  }

  const times = options.map((o) => o.durationMinutes);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  const costs = options.map((o) => o.cost).filter((c): c is number => c !== null);
  const minCost = costs.length ? Math.min(...costs) : 0;
  const maxCost = costs.length ? Math.max(...costs) : 0;

  const co2s = options.map((o) => o.co2Kg);
  const minCo2 = Math.min(...co2s);
  const maxCo2 = Math.max(...co2s);

  const scored = options.map((opt) => {
    // Normalise each dimension (0 = worst, 1 = best)
    const timeNorm = maxTime === minTime ? 1 : 1 - (opt.durationMinutes - minTime) / (maxTime - minTime);
    const co2Norm = maxCo2 === minCo2 ? 1 : 1 - (opt.co2Kg - minCo2) / (maxCo2 - minCo2);
    let costNorm = 1;
    if (opt.cost !== null && maxCost > minCost) {
      costNorm = 1 - (opt.cost - minCost) / (maxCost - minCost);
    } else if (opt.cost === null) {
      costNorm = 0.5; // neutral if missing
    }

    const wt = weights.time ?? 0.4;
    const wc = weights.cost ?? 0.3;
    const wz = weights.co2 ?? 0.3;
    const totalW = wt + wc + wz || 1;

    const finalScore = round((timeNorm * wt + costNorm * wc + co2Norm * wz) / totalW, 3);
    const tags: string[] = opt.tags ? [...opt.tags] : [];

    if (opt.durationMinutes === minTime && !tags.includes("Fastest")) tags.push("Fastest");
    if (opt.co2Kg === minCo2 && !tags.includes("Lowest CO2")) tags.push("Lowest CO2");
    if (opt.cost !== null && opt.cost === minCost && !tags.includes("Cheapest")) tags.push("Cheapest");

    return {
      ...opt,
      score: finalScore,
      tags,
    } as T;
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const first = scored[0];
  if (first && (!first.tags || first.tags.length === 0)) {
    first.tags = ["Best balance"];
  }

  return scored;
}

/**
 * Generate swap nudge comparing an option to car
 */
export function generateCarSwapNudge(
  carOpt: { durationMinutes: number; cost: number | null; co2Kg: number },
  altOpt: { label: string; durationMinutes: number; cost: number | null; co2Kg: number }
): string | null {
  const co2Diff = round(carOpt.co2Kg - altOpt.co2Kg, 2);
  if (co2Diff <= 0) return null; // didn't save CO2

  const timeDiff = Math.round(altOpt.durationMinutes - carOpt.durationMinutes);
  const timeDesc = timeDiff > 0 ? `${timeDiff} min slower` : `${Math.abs(timeDiff)} min faster`;

  return `${altOpt.label} instead of your vehicle: ${timeDesc}, ${co2Diff} kg less CO2.`;
}
