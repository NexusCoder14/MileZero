import { FastifyInstance } from "fastify";
import {
  PlanQuerySchema,
  PlanResult,
  PlanOption,
  calculateDriving,
  calculateTransitCO2,
  resolveTransitFare,
  rankOptions,
  generateCarSwapNudge,
  CityRates,
  RatesFileSchema,
} from "@milezero/shared";
import { GeocoderService } from "../routing/geocoder.js";
import { RoutingService } from "../routing/router.js";
import { OsmTransitNetwork } from "../transit/osm-transit.js";
import { JsonFileStorage } from "../storage/index.js";
import { signPlanToken } from "../lib/crypto.js";

export function registerPlannerRoutes(
  app: FastifyInstance,
  services: {
    geocoder: GeocoderService;
    router: RoutingService;
    transitNetwork: OsmTransitNetwork;
    storage: JsonFileStorage;
    sessionSecret: string;
  }
) {
  // GET /api/places/search
  app.get("/api/places/search", async (req, reply) => {
    const query = (req.query as { q?: string }).q;
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      const places = await services.geocoder.search(query);
      return places;
    } catch (err: unknown) {
      reply.code(502);
      return { error: { code: "GEOCODER_ERROR", message: (err as Error).message } };
    }
  });

  // GET /api/places/reverse
  app.get("/api/places/reverse", async (req, reply) => {
    const q = req.query as { lat?: string; lon?: string };
    const lat = parseFloat(q.lat || "");
    const lon = parseFloat(q.lon || "");

    if (isNaN(lat) || isNaN(lon)) {
      reply.code(400);
      return { error: { code: "BAD_REQUEST", message: "lat and lon are required numbers" } };
    }

    try {
      const place = await services.geocoder.reverse(lat, lon);
      return place || { lat, lon, name: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
    } catch (err: unknown) {
      reply.code(502);
      return { error: { code: "GEOCODER_ERROR", message: (err as Error).message } };
    }
  });

  // POST /api/plan
  app.post("/api/plan", async (req, reply) => {
    const parsed = PlanQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
        },
      };
    }

    const { from, to, preferences } = parsed.data;

    // Load city rates
    const ratesFile = await services.storage.read("rates.json", RatesFileSchema, {
      schema: 1,
      generatedAt: new Date().toISOString().slice(0, 10),
      cities: {},
    });

    const cityRates: CityRates | undefined = ratesFile.cities["mumbai"];
    const notices: string[] = [];

    // Parallel fan-out: street routes and the OSM network search.
    // For transit leg walking transfers/access, use fast direct calculation so we don't spam network calls.
    const [footRoute, bikeRoute, carRoute, transitJourneys] = await Promise.all([
      services.router.route("foot", from, to),
      services.router.route("bike", from, to),
      services.router.route("car", from, to),
      services.transitNetwork.plan(from, to).catch(() => []),
    ]);

    const options: PlanOption[] = [];

    // 1. Walk option
    options.push({
      id: "opt-walk",
      mode: "walk",
      label: "Walk",
      distanceKm: footRoute.distanceKm,
      durationMinutes: footRoute.durationMinutes,
      cost: 0,
      co2Kg: 0,
      legs: [
        {
          mode: "walk",
          distanceKm: footRoute.distanceKm,
          durationMinutes: footRoute.durationMinutes,
          geometry: footRoute.geometry,
        },
      ],
    });

    // 2. Cycle option
    options.push({
      id: "opt-cycle",
      mode: "cycle",
      label: "Cycle",
      distanceKm: bikeRoute.distanceKm,
      durationMinutes: bikeRoute.durationMinutes,
      cost: 0,
      co2Kg: 0,
      legs: [
        {
          mode: "cycle",
          distanceKm: bikeRoute.distanceKm,
          durationMinutes: bikeRoute.durationMinutes,
          geometry: bikeRoute.geometry,
        },
      ],
    });

    // 3. Driving option
    const drivingCalc = calculateDriving({
      distanceKm: carRoute.distanceKm,
      durationMinutes: carRoute.durationMinutes,
      occupancy: preferences?.occupancy,
      parkingFee: preferences?.parkingFee,
      petrolPricePerL: cityRates?.petrol?.perLitre,
    });

    const carOption: PlanOption = {
      id: "opt-car",
      mode: "car",
      label: "Your vehicle",
      distanceKm: carRoute.distanceKm,
      durationMinutes: carRoute.durationMinutes,
      cost: drivingCalc.totalCost,
      costBreakdown: {
        fuel: drivingCalc.fuelCost,
        parking: preferences?.parkingFee || 0,
      },
      co2Kg: drivingCalc.co2Kg,
      legs: [
        {
          mode: "car",
          distanceKm: carRoute.distanceKm,
          durationMinutes: carRoute.durationMinutes,
          geometry: carRoute.geometry,
        },
      ],
    };
    options.push(carOption);

    // 4. Estimated OSM transit options.
    if (transitJourneys.length > 0) {
      for (let i = 0; i < transitJourneys.length; i++) {
        const tj = transitJourneys[i];
        if (!tj) continue;
        let totalFare: number | null = 0;
        let totalCO2 = 0;

        const rideLegs = tj.legs.map((leg) => {
          const modeStr = leg.mode;
          const fareRes = resolveTransitFare(
            cityRates,
            modeStr,
            `${leg.operator || ""} ${leg.line}`,
            leg.distanceKm
          );

          if (fareRes.amount === null) {
            totalFare = null;
          } else if (totalFare !== null) {
            totalFare += fareRes.amount;
          }

          const legCo2 = calculateTransitCO2(modeStr, leg.distanceKm);
          totalCO2 += legCo2;

          return {
            mode: modeStr as "bus" | "metro" | "train",
            distanceKm: leg.distanceKm,
            durationMinutes: leg.durationMinutes,
            fromName: leg.fromStop.name,
            toName: leg.toStop.name,
            line: leg.line,
            operator: leg.operator,
            stopsPassed: leg.stopsPassed,
            stopsCount: leg.stopsPassed.length,
            geometry: leg.geometry,
            estimated: true,
            note: `Estimated speed ${leg.estimatedSpeedKmh} km/h; assumed wait ${leg.assumedWaitMinutes} minutes.`,
            fare: fareRes.amount,
            fareInfo: fareRes.info
              ? {
                  label: fareRes.info.label,
                  sourceTitle: fareRes.info.sourceTitle,
                  sourceUrl: fareRes.info.sourceUrl,
                  verified: fareRes.info.verified,
                  note: fareRes.info.note,
                }
              : null,
          };
        });
        const legs = [
          { mode: "walk" as const, distanceKm: tj.access.distanceKm, durationMinutes: tj.access.durationMinutes, geometry: tj.access.geometry, note: "Walking access to the first transit stop." },
          ...rideLegs,
          ...(tj.transferWalkKm > 0 ? [{ mode: "walk" as const, distanceKm: tj.transferWalkKm, durationMinutes: Math.ceil(tj.transferWalkKm / 5 * 60), note: "Walking transfer between transit lines." }] : []),
          { mode: "walk" as const, distanceKm: tj.egress.distanceKm, durationMinutes: tj.egress.durationMinutes, geometry: tj.egress.geometry, note: "Walking egress from the last transit stop." },
        ];

        const transitOpt: PlanOption = {
          id: `opt-transit-${i + 1}`,
          mode: "transit",
          label: tj.legs.map((l) => l.line || "Transit").join(" + "),
          distanceKm: tj.totalDistanceKm,
          durationMinutes: tj.totalDurationMinutes,
          cost: totalFare,
          costBreakdown: { fare: totalFare },
          co2Kg: Math.round(totalCO2 * 1000) / 1000,
          legs,
          estimated: true,
          tags: ["Estimated"],
          note: "Estimated from OpenStreetMap, not a timetable",
        };
        options.push(transitOpt);
      }
    } else {
      notices.push(
        "No connecting OpenStreetMap transit line was found for this trip. Walking, cycling and driving remain available."
      );
    }

    // Rank options according to user preferences
    const weights = preferences?.weights || { time: 0.4, cost: 0.3, co2: 0.3 };
    const rankedOptions = rankOptions(options, weights);

    // Compute swap nudges vs car
    for (const opt of rankedOptions) {
      if (opt.id !== "opt-car") {
        opt.nudge = generateCarSwapNudge(carOption, {
          label: opt.label,
          durationMinutes: opt.durationMinutes,
          cost: opt.cost,
          co2Kg: opt.co2Kg,
        });

        const co2Saved = Math.max(0, Math.round((carOption.co2Kg - opt.co2Kg) * 1000) / 1000);
        const tokenPayload = JSON.stringify({
          optionId: opt.id,
          mode: opt.mode,
          distanceKm: opt.distanceKm,
          durationMinutes: opt.durationMinutes,
          cost: opt.cost,
          co2Kg: opt.co2Kg,
          co2SavedKg: co2Saved,
          fromName: from.name,
          toName: to.name,
          expiresAt: Date.now() + 1000 * 60 * 60 * 24,
        });
        opt.token = signPlanToken(tokenPayload, services.sessionSecret);
      }
    }

    const result: PlanResult = {
      from,
      to,
      generatedAt: new Date().toISOString(),
      options: rankedOptions,
      notices,
      providers: {
        transit: transitJourneys.length > 0 ? "estimated_osm" : services.transitNetwork.status().state === "estimated_osm" ? "empty" : services.transitNetwork.status().state,
        message: transitJourneys.length > 0
          ? "Estimated from OpenStreetMap, not a timetable."
          : services.transitNetwork.status().message,
      },
    };

    return result;
  });
}
