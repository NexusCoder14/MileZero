import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import { haversine } from "@milezero/shared";

export type OsmMode = "bus" | "metro" | "train";
export type OSMElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
  members?: Array<{ type: string; ref: number; role?: string }>;
};

export interface TransitStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface TransitRoute {
  id: string;
  mode: OsmMode;
  ref?: string;
  name?: string;
  operator?: string;
  network?: string;
  from?: string;
  to?: string;
  stops: TransitStop[];
  geometry: [number, number][];
}

export interface TransitSnapshot {
  schema: 1;
  city: string;
  fetchedAt: string;
  routes: TransitRoute[];
  discarded: Record<string, number>;
}

export interface TransitStatus {
  city: string;
  state: "estimated_osm" | "empty" | "snapshot_missing" | "refreshing" | "error";
  message: string;
  fetchedAt?: string;
  routeCount: number;
  stopCount: number;
  discarded: Record<string, number>;
  nextRefresh?: string;
  lastError?: string;
}

export interface TransitLeg {
  mode: OsmMode;
  routeId: string;
  line: string;
  operator?: string;
  fromStop: TransitStop;
  toStop: TransitStop;
  stopsPassed: string[];
  distanceKm: number;
  durationMinutes: number;
  geometry: [number, number][];
  estimatedSpeedKmh: number;
  assumedWaitMinutes: number;
  fareOperator?: string;
}

export interface TransitJourney {
  legs: TransitLeg[];
  access: { distanceKm: number; durationMinutes: number; geometry?: [number, number][] };
  egress: { distanceKm: number; durationMinutes: number; geometry?: [number, number][] };
  transferWalkKm: number;
  totalDistanceKm: number;
  totalDurationMinutes: number;
  transfersCount: number;
  estimated: true;
  note: string;
}

const MODES: Record<string, OsmMode> = {
  bus: "bus",
  subway: "metro",
  light_rail: "metro",
  tram: "metro",
  train: "train",
  monorail: "metro",
};
const SPEEDS: Record<OsmMode, number> = { bus: 18, metro: 32, train: 42 };
const WAITS: Record<OsmMode, number> = { bus: 10, metro: 8, train: 12 };
const CITY_BOXES = { mumbai: "18.80,72.70,19.35,73.20" };
const USER_AGENT = "MileZero/1.0 (OpenStreetMap transit network snapshot)";

function cell(lat: number, lon: number): string {
  return `${Math.floor(lat * 100)},${Math.floor(lon * 100)}`;
}

export function normalizeOperator(value?: string): string | undefined {
  if (!value) return undefined;
  const name = value.toLowerCase();
  if (name.includes("best")) return "BEST";
  if (name.includes("metro one") || name.includes("reliance")) return "Mumbai Metro One";
  if (name.includes("mmrda") || name.includes("metro line 2")) return "MMRDA Metro";
  if (name.includes("central railway")) return "Central Railway";
  if (name.includes("western railway")) return "Western Railway";
  return value.trim();
}

export function snapDistanceAlong(route: TransitRoute, stop: TransitStop): number {
  let best = Number.POSITIVE_INFINITY;
  let bestDistance = 0;
  let walked = 0;
  for (let i = 0; i < route.geometry.length; i++) {
    const point = route.geometry[i];
    if (!point) continue;
    const d = haversine({ lat: point[0], lon: point[1] }, stop);
    if (d < best) {
      best = d;
      bestDistance = walked;
    }
    const next = route.geometry[i + 1];
    if (next) walked += haversine({ lat: point[0], lon: point[1] }, { lat: next[0], lon: next[1] });
  }
  return bestDistance;
}

export function parseOverpass(elements: OSMElement[], city = "mumbai"): TransitSnapshot {
  const nodes = new Map<number, OSMElement>();
  const ways = new Map<number, OSMElement>();
  for (const element of elements) {
    if (element.type === "node") nodes.set(element.id, element);
    if (element.type === "way") ways.set(element.id, element);
  }
  const discarded: Record<string, number> = {};
  const discard = (reason: string) => { discarded[reason] = (discarded[reason] ?? 0) + 1; };
  const routes: TransitRoute[] = [];

  for (const relation of elements.filter((e) => e.type === "relation")) {
    const mode = MODES[relation.tags?.route ?? ""];
    if (!mode) {
      discard("unknown_mode");
      continue;
    }
    const members = relation.members ?? [];
    const stops: TransitStop[] = [];
    for (const member of members) {
      if (member.type !== "node" || !["stop", "platform", "stop_entry_only", "stop_exit_only"].includes(member.role ?? "stop")) continue;
      const node = nodes.get(member.ref);
      if (node?.lat == null || node.lon == null) continue;
      const name = node.tags?.name;
      if (!name) continue;
      if (!stops.some((stop) => stop.id === String(node.id))) {
        stops.push({ id: String(node.id), name, lat: node.lat, lon: node.lon });
      }
    }
    if (stops.length < 2) {
      discard("fewer_than_two_stops");
      continue;
    }
    const geometry: [number, number][] = [];
    for (const member of members) {
      if (member.type !== "way") continue;
      const way = ways.get(member.ref);
      if (way?.geometry) {
        for (const point of way.geometry) {
          const next: [number, number] = [point.lat, point.lon];
          const prior = geometry[geometry.length - 1];
          if (!prior || prior[0] !== next[0] || prior[1] !== next[1]) geometry.push(next);
        }
      } else if (way?.nodes) {
        for (const nodeId of way.nodes) {
          const node = nodes.get(nodeId);
          if (node?.lat != null && node.lon != null) geometry.push([node.lat, node.lon]);
        }
      }
    }
    if (geometry.length < 2) {
      discard("missing_geometry");
      continue;
    }
    routes.push({
      id: String(relation.id),
      mode,
      ref: relation.tags?.ref,
      name: relation.tags?.name,
      operator: normalizeOperator(relation.tags?.operator ?? relation.tags?.network),
      network: relation.tags?.network,
      from: relation.tags?.from,
      to: relation.tags?.to,
      stops,
      geometry,
    });
  }
  return { schema: 1, city, fetchedAt: new Date().toISOString(), routes, discarded };
}

function privateAddress(address: string): boolean {
  const clean = address.toLowerCase().replace(/^::ffff:/, "");
  if (net.isIPv4(clean)) {
    const [a = 0, b = 0] = clean.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  return !net.isIP(clean) || clean === "::1" || clean.startsWith("fc") || clean.startsWith("fd") ||
    clean.startsWith("fe80") || clean.startsWith("ff");
}

async function safeOverpassFetch(url: string, query: string): Promise<OSMElement[]> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || (parsed.port && parsed.port !== "443")) throw new Error("Overpass URL must use HTTPS on port 443");
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) throw new Error("Overpass host resolves to a private address");
  const response = await fetch(url, {
    method: "POST",
    body: new URLSearchParams({ data: query }),
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`Overpass returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 40 * 1024 * 1024) throw new Error("Overpass response exceeds 40 MB");
  const json = JSON.parse(bytes.toString("utf8")) as { elements?: OSMElement[] };
  return json.elements ?? [];
}

export function overpassQuery(bbox = CITY_BOXES.mumbai): string {
  return `[out:json][timeout:40];rel["route"~"^(bus|subway|light_rail|tram|train|monorail)$"](${bbox});out body;>;out geom;`;
}

export class OsmTransitNetwork {
  private snapshot: TransitSnapshot | null = null;
  private index = new Map<string, TransitStop[]>();
  private stopToRoutes = new Map<string, Array<{ route: TransitRoute; index: number }>>();
  private refreshing = false;
  private lastError?: string;
  private timer?: NodeJS.Timeout;
  constructor(
    private readonly dataDir: string,
    private readonly overpassUrl = "https://overpass-api.de/api/interpreter",
    private readonly city = "mumbai",
    private readonly fetchElements: (url: string, query: string) => Promise<OSMElement[]> = safeOverpassFetch
  ) {}

  private filePath(): string { return path.join(this.dataDir, "transit", `${this.city}.json`); }
  private rebuildIndex(): void {
    this.index.clear();
    this.stopToRoutes.clear();
    for (const route of this.snapshot?.routes ?? []) {
      for (let i = 0; i < route.stops.length; i++) {
        const stop = route.stops[i];
        if (!stop) continue;
        const key = cell(stop.lat, stop.lon);
        const list = this.index.get(key) ?? [];
        if (!list.some((item) => item.id === stop.id)) list.push(stop);
        this.index.set(key, list);

        let rList = this.stopToRoutes.get(stop.id);
        if (!rList) {
          rList = [];
          this.stopToRoutes.set(stop.id, rList);
        }
        rList.push({ route, index: i });
      }
    }
  }
  async load(): Promise<void> {
    try {
      this.snapshot = JSON.parse(await fs.readFile(this.filePath(), "utf8")) as TransitSnapshot;
      this.rebuildIndex();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.lastError = (error as Error).message;
    }
  }
  async refresh(): Promise<TransitStatus> {
    if (this.refreshing) return this.status("refreshing");
    this.refreshing = true;
    try {
      const parsed = parseOverpass(await this.fetchElements(this.overpassUrl, overpassQuery()), this.city);
      await fs.mkdir(path.dirname(this.filePath()), { recursive: true });
      await fs.writeFile(this.filePath(), JSON.stringify(parsed, null, 2) + "\n", "utf8");
      this.snapshot = parsed;
      this.lastError = undefined;
      this.rebuildIndex();
    } catch (error) {
      this.lastError = (error as Error).message;
    } finally {
      this.refreshing = false;
    }
    return this.status();
  }
  start(autoRefresh = true): void {
    if (this.timer) return;
    void this.load().then(async () => {
      const fetched = this.snapshot?.fetchedAt ? Date.parse(this.snapshot.fetchedAt) : 0;
      if (autoRefresh && (!fetched || Date.now() - fetched > 14 * 86400000)) await this.refresh();
    });
    this.timer = setInterval(() => void this.refresh(), 14 * 86400000);
    this.timer.unref();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  status(state?: TransitStatus["state"]): TransitStatus {
    const routeCount = this.snapshot?.routes.length ?? 0;
    const stopCount = new Set((this.snapshot?.routes ?? []).flatMap((route) => route.stops.map((stop) => stop.id))).size;
    const fetched = this.snapshot?.fetchedAt ? Date.parse(this.snapshot.fetchedAt) : 0;
    const current: TransitStatus["state"] = state ?? (this.refreshing ? "refreshing" : this.lastError ? "error" : routeCount ? "estimated_osm" : "snapshot_missing");
    return {
      city: this.city,
      state: current,
      message: current === "estimated_osm" ? "Estimated transit network loaded from OpenStreetMap, not a timetable." :
        current === "empty" ? "No connecting OpenStreetMap transit line was found for this trip." :
        current === "refreshing" ? "OpenStreetMap transit network refresh is running; the previous snapshot remains available." :
        current === "error" ? "OpenStreetMap refresh failed; the previous snapshot remains in use." :
        "No OpenStreetMap transit snapshot is available yet.",
      fetchedAt: this.snapshot?.fetchedAt,
      routeCount,
      stopCount,
      discarded: this.snapshot?.discarded ?? {},
      nextRefresh: fetched ? new Date(fetched + 14 * 86400000).toISOString() : undefined,
      lastError: this.lastError,
    };
  }
  findNearbyStops(lat: number, lon: number, radiusKm: number): Array<{ stop: TransitStop; distanceKm: number }> {
    const result: Array<{ stop: TransitStop; distanceKm: number }> = [];
    const latCells = Math.ceil(radiusKm / 1.11);
    const lonCells = Math.ceil(radiusKm / (1.11 * Math.max(0.1, Math.cos(lat * Math.PI / 180))));
    const baseLat = Math.floor(lat * 100);
    const baseLon = Math.floor(lon * 100);
    for (let y = -latCells; y <= latCells; y++) for (let x = -lonCells; x <= lonCells; x++) {
      for (const stop of this.index.get(`${baseLat + y},${baseLon + x}`) ?? []) {
        const distanceKm = haversine({ lat, lon }, stop);
        if (distanceKm <= radiusKm && !result.some((item) => item.stop.id === stop.id)) result.push({ stop, distanceKm });
      }
    }
    return result.sort((a, b) => a.distanceKm - b.distanceKm);
  }
  routes(): TransitRoute[] { return this.snapshot?.routes ?? []; }
  async plan(
    from: { lat: number; lon: number },
    to: { lat: number; lon: number },
    walk?: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Promise<{ distanceKm: number; durationMinutes: number; geometry?: [number, number][] }>
  ): Promise<TransitJourney[]> {
    if (!this.snapshot?.routes.length) return [];
    const walkRoute = walk ?? (async (a, b) => {
      const distanceKm = Math.round(haversine(a, b) * 1.2 * 100) / 100;
      return { distanceKm, durationMinutes: Math.round((distanceKm / 4.8) * 60 * 10) / 10 };
    });

    const access = this.findNearbyStops(from.lat, from.lon, 0.8).slice(0, 5);
    const egress = this.findNearbyStops(to.lat, to.lon, 0.8).slice(0, 5);
    const journeys: TransitJourney[] = [];

    // 1. Direct routes using reverse stop-to-routes index
    for (const origin of access) {
      const candidates = this.stopToRoutes.get(origin.stop.id) ?? [];
      for (const { route, index: a } of candidates) {
        for (const destination of egress) {
          const b = route.stops.findIndex((stop, idx) => idx > a && stop.id === destination.stop.id);
          if (b <= a) continue;

          const startAlong = snapDistanceAlong(route, origin.stop);
          const endAlong = snapDistanceAlong(route, destination.stop);
          const distanceKm = Math.max(0.1, endAlong - startAlong);
          const accessWalk = await walkRoute(from, origin.stop);
          const egressWalk = await walkRoute(destination.stop, to);
          if (accessWalk.distanceKm > 0.8 || egressWalk.distanceKm > 0.8) continue;

          const line = route.ref || route.name || `${route.mode} line`;
          const rideMinutes = Math.ceil((distanceKm / SPEEDS[route.mode]) * 60);
          journeys.push({
            legs: [{
              mode: route.mode,
              routeId: route.id,
              line,
              operator: route.operator,
              fromStop: origin.stop,
              toStop: destination.stop,
              stopsPassed: route.stops.slice(a, b + 1).map((stop) => stop.name),
              distanceKm,
              durationMinutes: rideMinutes,
              geometry: route.geometry,
              estimatedSpeedKmh: SPEEDS[route.mode],
              assumedWaitMinutes: WAITS[route.mode],
              fareOperator: route.operator,
            }],
            access: accessWalk,
            egress: egressWalk,
            transferWalkKm: 0,
            totalDistanceKm: distanceKm + accessWalk.distanceKm + egressWalk.distanceKm,
            totalDurationMinutes: Math.ceil(accessWalk.durationMinutes + WAITS[route.mode] + rideMinutes + egressWalk.durationMinutes),
            transfersCount: 0,
            estimated: true,
            note: "Estimated from OpenStreetMap, not a timetable",
          });
        }
      }
    }

    // 2. 1-transfer routes if needed
    if (journeys.length < 3) {
      for (const a of access) {
        const firstCandidates = this.stopToRoutes.get(a.stop.id) ?? [];
        for (const { route: first, index: firstStart } of firstCandidates) {
          for (let firstEnd = firstStart + 1; firstEnd < first.stops.length; firstEnd++) {
            const transfer = first.stops[firstEnd];
            if (!transfer) continue;

            for (const z of egress) {
              const secondCandidates = this.stopToRoutes.get(z.stop.id) ?? [];
              for (const { route: second, index: secondEnd } of secondCandidates) {
                if (first.id === second.id) continue;
                if (first.mode !== second.mode && first.stops.length < 2) continue;

                const secondStart = second.stops.findIndex((s, idx) => idx < secondEnd && haversine(transfer, s) <= 0.3);
                if (secondStart < 0 || secondStart >= secondEnd) continue;
                const secondTransfer = second.stops[secondStart];
                if (!secondTransfer) continue;

                const transferWalk = await walkRoute(transfer, secondTransfer);
                if (transferWalk.distanceKm > 0.3) continue;
                const accessWalk = await walkRoute(from, a.stop);
                const egressWalk = await walkRoute(z.stop, to);

                const firstDistance = Math.max(0.1, snapDistanceAlong(first, transfer) - snapDistanceAlong(first, a.stop));
                const secondDistance = Math.max(0.1, snapDistanceAlong(second, z.stop) - snapDistanceAlong(second, secondTransfer));
                const legs: TransitLeg[] = [
                  {
                    mode: first.mode,
                    routeId: first.id,
                    line: first.ref || first.name || `${first.mode} line`,
                    operator: first.operator,
                    fromStop: a.stop,
                    toStop: transfer,
                    stopsPassed: first.stops.slice(firstStart, firstEnd + 1).map((stop) => stop.name),
                    distanceKm: firstDistance,
                    durationMinutes: Math.ceil((firstDistance / SPEEDS[first.mode]) * 60),
                    geometry: first.geometry,
                    estimatedSpeedKmh: SPEEDS[first.mode],
                    assumedWaitMinutes: WAITS[first.mode],
                    fareOperator: first.operator,
                  },
                  {
                    mode: second.mode,
                    routeId: second.id,
                    line: second.ref || second.name || `${second.mode} line`,
                    operator: second.operator,
                    fromStop: secondTransfer,
                    toStop: z.stop,
                    stopsPassed: second.stops.slice(secondStart, secondEnd + 1).map((stop) => stop.name),
                    distanceKm: secondDistance,
                    durationMinutes: Math.ceil((secondDistance / SPEEDS[second.mode]) * 60),
                    geometry: second.geometry,
                    estimatedSpeedKmh: SPEEDS[second.mode],
                    assumedWaitMinutes: WAITS[second.mode],
                    fareOperator: second.operator,
                  },
                ];

                journeys.push({
                  legs,
                  access: accessWalk,
                  egress: egressWalk,
                  transferWalkKm: transferWalk.distanceKm,
                  totalDistanceKm: firstDistance + secondDistance + accessWalk.distanceKm + egressWalk.distanceKm + transferWalk.distanceKm,
                  totalDurationMinutes: Math.ceil(
                    accessWalk.durationMinutes +
                    WAITS[first.mode] +
                    legs[0]!.durationMinutes +
                    transferWalk.durationMinutes +
                    WAITS[second.mode] +
                    legs[1]!.durationMinutes +
                    egressWalk.durationMinutes
                  ),
                  transfersCount: 1,
                  estimated: true,
                  note: "Estimated from OpenStreetMap, not a timetable",
                });
              }
            }
          }
        }
      }
    }

    const unique = journeys.sort((a, b) => a.transfersCount - b.transfersCount || a.totalDurationMinutes - b.totalDurationMinutes)
      .filter((journey, index, list) => !list.some((other, otherIndex) => otherIndex < index && other.totalDurationMinutes <= journey.totalDurationMinutes && (other.totalDistanceKm <= journey.totalDistanceKm)));
    return unique.slice(0, 4);
  }
}
