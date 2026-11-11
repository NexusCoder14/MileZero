import { haversine } from "@milezero/shared";

/**
 * Decodes Google-encoded polyline string to array of [lat, lon] coordinates.
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0,
    len = encoded.length;
  let lat = 0,
    lng = 0;

  while (index < len) {
    let b,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  geometry: [number, number][]; // [lat, lon]
}

export class RoutingService {
  private urlTemplate: string;

  constructor(urlTemplate: string) {
    this.urlTemplate = urlTemplate;
  }

  /**
   * Route between coordinates.
   * If OSRM fails or is unavailable, falls back to direct line estimation.
   */
  async route(
    profile: "car" | "bike" | "foot",
    from: { lat: number; lon: number },
    to: { lat: number; lon: number }
  ): Promise<RouteResult> {
    const osrmProfile = profile === "car" ? "car" : profile === "bike" ? "bike" : "foot";
    const base = this.urlTemplate.includes("{profile}")
      ? this.urlTemplate.replace("{profile}", osrmProfile)
      : this.urlTemplate;

    const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    const url = `${base.replace(/\/+$/, "")}/route/v1/${osrmProfile}/${coords}?overview=full&geometries=polyline`;

    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "MileZero-JourneyPlanner/1.0" },
        signal: AbortSignal.timeout(6000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as {
          code: string;
          routes?: Array<{
            distance: number;
            duration: number;
            geometry: string;
          }>;
        };

        if (data.code === "Ok" && data.routes && data.routes.length > 0) {
          const r = data.routes[0];
          if (r) {
            return {
              distanceKm: Math.round((r.distance / 1000) * 100) / 100,
              durationMinutes: Math.round((r.duration / 60) * 10) / 10,
              geometry: decodePolyline(r.geometry),
            };
          }
        }
      }
    } catch {
      // router unreachable or timed out
    }

    // Direct line fallback with profile speed & detour factor
    const directKm = haversine(from, to);
    const detour = profile === "car" ? 1.35 : profile === "bike" ? 1.25 : 1.2;
    const estKm = Math.round(directKm * detour * 100) / 100;
    const speedKmh = profile === "car" ? 25.0 : profile === "bike" ? 15.0 : 4.8;
    const durMin = Math.round(((estKm / speedKmh) * 60) * 10) / 10;

    return {
      distanceKm: estKm,
      durationMinutes: durMin,
      geometry: [
        [from.lat, from.lon],
        [to.lat, to.lon],
      ],
    };
  }
}
