export interface NominatimPlace {
  place_id: number;
  osm_id: number;
  osm_type: string;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  address?: Record<string, string>;
}

export interface GeocodeResult {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  type?: string;
}

export class GeocoderService {
  private baseUrl: string;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestTime = 0;
  private minIntervalMs = 1050; // Respect Nominatim 1 req/sec policy
  private cache: Map<string, { data: GeocodeResult[]; expiresAt: number }> = new Map();
  private cacheTtlMs = 1000 * 60 * 60 * 24; // 24h cache

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async rateLimitedFetch(url: string): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        const now = Date.now();
        const wait = Math.max(0, this.minIntervalMs - (now - this.lastRequestTime));
        if (wait > 0) {
          await new Promise((r) => setTimeout(r, wait));
        }
        this.lastRequestTime = Date.now();
        try {
          const resp = await fetch(url, {
            headers: {
              "User-Agent": "MileZero-JourneyPlanner/1.0 (+https://milezero.org)",
              Accept: "application/json",
            },
          });
          resolve(resp);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async search(query: string, viewbox?: [number, number, number, number]): Promise<GeocodeResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const cacheKey = `search:${trimmed}:${viewbox ? viewbox.join(",") : ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const params = new URLSearchParams({
      q: trimmed,
      format: "jsonv2",
      addressdetails: "1",
      limit: "8",
    });

    if (viewbox) {
      // viewbox=left,top,right,bottom (lon1,lat1,lon2,lat2)
      params.set("viewbox", viewbox.join(","));
      params.set("bounded", "0");
    }

    const url = `${this.baseUrl}/search?${params.toString()}`;
    const resp = await this.rateLimitedFetch(url);
    if (!resp.ok) {
      throw new Error(`Geocoder responded with status ${resp.status}`);
    }

    const raw = (await resp.json()) as NominatimPlace[];
    const results: GeocodeResult[] = raw.map((r) => ({
      id: `${r.osm_type || "osm"}_${r.osm_id || r.place_id}`,
      name: r.name || r.display_name.split(",")[0] || trimmed,
      displayName: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      type: r.type,
    }));

    this.cache.set(cacheKey, { data: results, expiresAt: Date.now() + this.cacheTtlMs });
    return results;
  }

  async reverse(lat: number, lon: number): Promise<GeocodeResult | null> {
    const cacheKey = `reverse:${lat.toFixed(5)},${lon.toFixed(5)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() && cached.data[0]) {
      return cached.data[0];
    }

    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      format: "jsonv2",
      addressdetails: "1",
    });

    const url = `${this.baseUrl}/reverse?${params.toString()}`;
    const resp = await this.rateLimitedFetch(url);
    if (!resp.ok) {
      throw new Error(`Reverse geocoder responded with status ${resp.status}`);
    }

    const r = (await resp.json()) as NominatimPlace;
    if (!r || !r.lat) return null;

    const result: GeocodeResult = {
      id: `${r.osm_type || "osm"}_${r.osm_id || r.place_id}`,
      name: r.name || r.display_name.split(",")[0] || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      displayName: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      type: r.type,
    };

    this.cache.set(cacheKey, { data: [result], expiresAt: Date.now() + this.cacheTtlMs });
    return result;
  }
}

