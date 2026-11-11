import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import {
  JsonFileStorage,
  TripsFileSchema,
  GroupsFileSchema,
  ChallengesFileSchema,
  UsersFileSchema,
  LoggedTrip,
  Group,
  Challenge,
} from "../storage/index.js";
import { verifyPlanToken } from "../lib/crypto.js";

const LogTripBodySchema = z.object({
  planToken: z.string().min(1),
});

const CreateGroupSchema = z.object({
  name: z.string().min(2).max(50),
});

const JoinGroupSchema = z.object({
  joinCode: z.string().min(4),
});

const CreateChallengeSchema = z.object({
  title: z.string().min(3).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetMode: z.string().optional(),
});

export function registerCommunityRoutes(
  app: FastifyInstance,
  storage: JsonFileStorage,
  sessionSecret: string
) {
  function requireAuth(req: any, reply: any) {
    if (!req.currentUser) {
      reply.code(401);
      throw new Error("You must be signed in to perform this action");
    }
  }

  // POST /api/trips - Log trip from server-signed plan token
  app.post("/api/trips", async (req, reply) => {
    requireAuth(req, reply);

    const parsed = LogTripBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: "VALIDATION_ERROR", message: "Missing or invalid plan token" } };
    }

    const { planToken } = parsed.data;
    const verified = verifyPlanToken<{
      optionId: string;
      mode: string;
      distanceKm: number;
      durationMinutes: number;
      cost: number | null;
      co2Kg: number;
      co2SavedKg: number;
      fromName?: string;
      toName?: string;
    }>(planToken, sessionSecret);

    if (!verified.valid || !verified.data) {
      reply.code(400);
      return { error: { code: "INVALID_TOKEN", message: "Plan token is invalid, expired, or tampered" } };
    }

    const data = verified.data;
    const userId = req.currentUser!.id;

    const trips = await storage.read("trips.json", TripsFileSchema, []);
    const alreadyLogged = trips.some((t) => t.planToken === planToken);
    if (alreadyLogged) {
      reply.code(409);
      return { error: { code: "CONFLICT", message: "This trip result has already been logged." } };
    }

    const trip: LoggedTrip = {
      id: crypto.randomUUID(),
      userId,
      loggedAt: new Date().toISOString(),
      fromName: data.fromName,
      toName: data.toName,
      mode: data.mode,
      distanceKm: data.distanceKm,
      durationMinutes: data.durationMinutes,
      cost: data.cost,
      co2Kg: data.co2Kg,
      co2SavedKg: data.co2SavedKg,
      planToken,
    };

    await storage.update("trips.json", TripsFileSchema, [], (list) => [trip, ...list]);

    await storage.appendAudit({
      action: "TRIP_LOGGED",
      userId,
      tripId: trip.id,
      mode: trip.mode,
      co2SavedKg: trip.co2SavedKg,
    });

    return trip;
  });

  // GET /api/trips/impact - User's impact metrics & streaks
  app.get("/api/trips/impact", async (req, reply) => {
    requireAuth(req, reply);

    const userId = req.currentUser!.id;
    const trips = await storage.read("trips.json", TripsFileSchema, []);
    const userTrips = trips.filter((t) => t.userId === userId);

    let totalCo2SavedKg = 0;
    let totalDistanceKm = 0;
    const byMode: Record<string, number> = {};

    for (const t of userTrips) {
      totalCo2SavedKg += t.co2SavedKg;
      totalDistanceKm += t.distanceKm;
      byMode[t.mode] = (byMode[t.mode] || 0) + 1;
    }

    const dates = new Set(userTrips.map((t) => t.loggedAt.slice(0, 10)));
    const streak = dates.size;

    return {
      totalTrips: userTrips.length,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      totalCo2SavedKg: Math.round(totalCo2SavedKg * 100) / 100,
      byMode,
      streakDays: streak,
      recentTrips: userTrips.slice(0, 10),
    };
  });

  // POST /api/groups - Create a group
  app.post("/api/groups", async (req, reply) => {
    requireAuth(req, reply);

    const parsed = CreateGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: "VALIDATION_ERROR", message: "Group name required" } };
    }

    const { name } = parsed.data;
    const joinCode = crypto.randomBytes(3).toString("hex").toUpperCase();
    const now = new Date().toISOString();
    const userId = req.currentUser!.id;

    const group: Group = {
      id: crypto.randomUUID(),
      name,
      joinCode,
      createdBy: userId,
      createdAt: now,
      members: [{ userId, role: "admin", joinedAt: now }],
    };

    await storage.update("groups.json", GroupsFileSchema, [], (groups) => [...groups, group]);
    await storage.appendAudit({ action: "GROUP_CREATED", userId, groupId: group.id, name });

    return group;
  });

  // POST /api/groups/join - Join a group via join code
  app.post("/api/groups/join", async (req, reply) => {
    requireAuth(req, reply);

    const parsed = JoinGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: "VALIDATION_ERROR", message: "Valid join code required" } };
    }

    const { joinCode } = parsed.data;
    const userId = req.currentUser!.id;

    const groups = await storage.read("groups.json", GroupsFileSchema, []);
    const group = groups.find((g) => g.joinCode.toUpperCase() === joinCode.trim().toUpperCase());
    if (!group) {
      reply.code(404);
      return { error: { code: "NOT_FOUND", message: "No group found with this join code" } };
    }

    if (group.members.some((m) => m.userId === userId)) {
      return group;
    }

    await storage.update("groups.json", GroupsFileSchema, [], (list) =>
      list.map((g) =>
        g.id === group.id
          ? {
              ...g,
              members: [...g.members, { userId, role: "member" as const, joinedAt: new Date().toISOString() }],
            }
          : g
      )
    );

    await storage.appendAudit({ action: "GROUP_JOINED", userId, groupId: group.id });
    return group;
  });

  // GET /api/groups - List current user's groups
  app.get("/api/groups", async (req, reply) => {
    requireAuth(req, reply);

    const userId = req.currentUser!.id;
    const groups = await storage.read("groups.json", GroupsFileSchema, []);
    const userGroups = groups.filter((g) => g.members.some((m) => m.userId === userId));
    return userGroups;
  });

  // GET /api/groups/:id - View group & leaderboard (Outsiders get 404!)
  app.get("/api/groups/:id", async (req, reply) => {
    requireAuth(req, reply);

    const userId = req.currentUser!.id;
    const { id } = req.params as { id: string };
    const groups = await storage.read("groups.json", GroupsFileSchema, []);
    const group = groups.find((g) => g.id === id);

    if (!group || !group.members.some((m) => m.userId === userId)) {
      reply.code(404);
      return { error: { code: "NOT_FOUND", message: "Group not found" } };
    }

    // Build leaderboard
    const trips = await storage.read("trips.json", TripsFileSchema, []);
    const users = await storage.read("users.json", UsersFileSchema, []);

    const memberMap = new Map(users.map((u) => [u.id, u.displayName]));
    const memberStats: Record<string, { userId: string; displayName: string; co2SavedKg: number; tripsCount: number }> =
      {};

    for (const m of group.members) {
      memberStats[m.userId] = {
        userId: m.userId,
        displayName: memberMap.get(m.userId) || "Member",
        co2SavedKg: 0,
        tripsCount: 0,
      };
    }

    for (const t of trips) {
      const ms = memberStats[t.userId];
      if (ms) {
        ms.co2SavedKg += t.co2SavedKg;
        ms.tripsCount += 1;
      }
    }

    const leaderboard = Object.values(memberStats).sort((a, b) => b.co2SavedKg - a.co2SavedKg);

    const challenges = await storage.read("challenges.json", ChallengesFileSchema, []);
    const groupChallenges = challenges.filter((c) => c.groupId === group.id);

    return {
      group,
      leaderboard,
      challenges: groupChallenges,
    };
  });

  // POST /api/groups/:id/challenges - Create challenge for group
  app.post("/api/groups/:id/challenges", async (req, reply) => {
    requireAuth(req, reply);

    const userId = req.currentUser!.id;
    const { id } = req.params as { id: string };
    const groups = await storage.read("groups.json", GroupsFileSchema, []);
    const group = groups.find((g) => g.id === id);

    if (!group || !group.members.some((m) => m.userId === userId)) {
      reply.code(404);
      return { error: { code: "NOT_FOUND", message: "Group not found" } };
    }

    const parsed = CreateChallengeSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: "VALIDATION_ERROR", message: "Invalid challenge dates or title" } };
    }

    const challenge: Challenge = {
      id: crypto.randomUUID(),
      groupId: group.id,
      title: parsed.data.title,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      targetMode: parsed.data.targetMode,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };

    await storage.update("challenges.json", ChallengesFileSchema, [], (list) => [...list, challenge]);
    await storage.appendAudit({ action: "CHALLENGE_CREATED", groupId: group.id, challengeId: challenge.id });

    return challenge;
  });
}
