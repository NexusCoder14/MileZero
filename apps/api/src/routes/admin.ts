import { FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import {
  JsonFileStorage,
  ProposalsFileSchema,
  RatesFileSchema,
  Proposal,
  UsersFileSchema,
  SessionsFileSchema,
} from "../storage/index.js";
import { verifyProposal } from "../lib/verifier.js";
import { OsmTransitNetwork } from "../transit/osm-transit.js";
import { hashPassword } from "../lib/crypto.js";

const ManualPetrolSchema = z.object({
  city: z.string().min(1),
  perLitre: z.number().positive(),
  note: z.string().optional(),
});

export function registerAdminRoutes(
  app: FastifyInstance,
  storage: JsonFileStorage,
  dataDir: string,
  groqApiKey?: string,
  transitNetwork?: OsmTransitNetwork
) {
  // Admin auth guard
  function requireAdmin(req: any, reply: any) {
    if (!req.currentUser) {
      const error = new Error("You must be signed in") as Error & { statusCode?: number };
      error.statusCode = 401;
      throw error;
    }

    if (req.currentUser.role !== "admin") {
      const error = new Error("Administrator role required") as Error & { statusCode?: number };
      error.statusCode = 403;
      throw error;
    }

  }

  app.get("/api/admin/transit", async (req, reply) => {
    requireAdmin(req, reply);
    return transitNetwork?.status() ?? { state: "snapshot_missing", routeCount: 0, stopCount: 0 };
  });

  app.post("/api/admin/transit/refresh", async (req, reply) => {
    requireAdmin(req, reply);
    const status = await transitNetwork?.refresh();
    await storage.appendAudit({ action: "TRANSIT_NETWORK_REFRESHED", adminId: req.currentUser!.id });
    return status ?? { state: "snapshot_missing" };
  });

  app.get("/api/admin/users", async (req, reply) => {
    requireAdmin(req, reply);
    const users = await storage.read("users.json", UsersFileSchema, []);
    return users.map(({ id, email, displayName, role, createdAt, updatedAt }) => ({
      id, email, displayName, role, createdAt, updatedAt,
    }));
  });

  app.post("/api/admin/users/:id/temporary-password", async (req, reply) => {
    requireAdmin(req, reply);
    const { id } = req.params as { id: string };
    const temporaryPassword = crypto.randomBytes(12).toString("base64url");
    const users = await storage.read("users.json", UsersFileSchema, []);
    const target = users.find((user) => user.id === id);
    if (!target) {
      reply.code(404);
      return { error: { code: "NOT_FOUND", message: "User not found" } };
    }

    const passwordHash = await hashPassword(temporaryPassword);
    await storage.update("users.json", UsersFileSchema, [], (list) =>
      list.map((user) => user.id === id ? { ...user, passwordHash, updatedAt: new Date().toISOString() } : user)
    );
    await storage.update("sessions.json", SessionsFileSchema, [], (sessions) =>
      sessions.filter((session) => session.userId !== id)
    );
    await storage.appendAudit({
      action: "TEMPORARY_PASSWORD_SET",
      userId: id,
      adminId: req.currentUser!.id,
    });
    return {
      userId: id,
      displayName: target.displayName,
      temporaryPassword,
      message: "Show this temporary password once. The user's other sessions were ended.",
    };
  });

  // GET /api/admin/proposals - List all fare & petrol proposals
  app.get("/api/admin/proposals", async (req, reply) => {
    requireAdmin(req, reply);
    const proposals = await storage.read("proposals.json", ProposalsFileSchema, []);
    return proposals;
  });

  // POST /api/admin/proposals/:id/publish - Publish verified proposal to rates.json
  app.post("/api/admin/proposals/:id/publish", async (req, reply) => {
    requireAdmin(req, reply);
    const { id } = req.params as { id: string };

    const proposals = await storage.read("proposals.json", ProposalsFileSchema, []);
    const proposal = proposals.find((p) => p.id === id);

    if (!proposal) {
      reply.code(404);
      return { error: { code: "NOT_FOUND", message: "Proposal not found" } };
    }

    if (!proposal.verification.verified) {
      reply.code(400);
      return {
        error: {
          code: "CANNOT_PUBLISH_UNVERIFIED",
          message: "Only independently verified proposals can be published.",
        },
      };
    }

    // Apply to rates.json
    await storage.update("rates.json", RatesFileSchema, { schema: 1, generatedAt: "", cities: {} }, (rates) => {
      const cityKey = proposal.city.toLowerCase();
      if (!rates.cities[cityKey]) {
        rates.cities[cityKey] = { fares: {} };
      }
      const cityObj = rates.cities[cityKey]!;

      if (proposal.type === "petrol") {
        cityObj.petrol = {
          perLitre: (proposal.proposedData.perLitre as number) || 100,
          asOf: new Date().toISOString().slice(0, 10),
          source: {
            title: `Independent verification from ${proposal.sourceUrl}`,
            url: proposal.sourceUrl,
          },
          verified: true,
          note: "Approved by administrator after verified source inspection.",
        };
      }

      rates.generatedAt = new Date().toISOString().slice(0, 10);
      return rates;
    });

    const adminId = req.currentUser!.id;
    // Mark proposal published
    await storage.update("proposals.json", ProposalsFileSchema, [], (list) =>
      list.map((p) =>
        p.id === id
          ? {
              ...p,
              status: "published" as const,
              reviewedBy: adminId,
              reviewedAt: new Date().toISOString(),
            }
          : p
      )
    );

    await storage.appendAudit({
      action: "PROPOSAL_PUBLISHED",
      proposalId: id,
      city: proposal.city,
      type: proposal.type,
      adminId,
    });

    return { ok: true, message: "Proposal published to active rates." };
  });

  // POST /api/admin/proposals/:id/dismiss
  app.post("/api/admin/proposals/:id/dismiss", async (req, reply) => {
    requireAdmin(req, reply);
    const { id } = req.params as { id: string };
    const adminId = req.currentUser!.id;

    await storage.update("proposals.json", ProposalsFileSchema, [], (list) =>
      list.map((p) =>
        p.id === id
          ? {
              ...p,
              status: "rejected" as const,
              reviewedBy: adminId,
              reviewedAt: new Date().toISOString(),
            }
          : p
      )
    );

    await storage.appendAudit({ action: "PROPOSAL_DISMISSED", proposalId: id, adminId });
    return { ok: true };
  });

  // POST /api/admin/petrol/manual - Set petrol price by hand (marked "not independently checked")
  app.post("/api/admin/petrol/manual", async (req, reply) => {
    requireAdmin(req, reply);

    const parsed = ManualPetrolSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: "VALIDATION_ERROR", message: "Invalid petrol rate or city" } };
    }

    const { city, perLitre, note } = parsed.data;
    const cityKey = city.toLowerCase().trim();

    await storage.update("rates.json", RatesFileSchema, { schema: 1, generatedAt: "", cities: {} }, (rates) => {
      if (!rates.cities[cityKey]) {
        rates.cities[cityKey] = { fares: {} };
      }
      rates.cities[cityKey]!.petrol = {
        perLitre,
        asOf: new Date().toISOString().slice(0, 10),
        source: {
          title: "Manual operator setting (not independently checked)",
          url: "https://milezero.org",
        },
        verified: false,
        note: note || "Entered manually by operator; not independently checked.",
      };
      rates.generatedAt = new Date().toISOString().slice(0, 10);
      return rates;
    });

    const adminId = req.currentUser!.id;
    await storage.appendAudit({
      action: "MANUAL_PETROL_SET",
      city,
      perLitre,
      adminId,
    });

    return { ok: true, message: `Petrol for ${city} updated to ₹${perLitre} (marked unverified).` };
  });

  // GET /api/admin/audit - Stream or view append-only audit log
  app.get("/api/admin/audit", async (req, reply) => {
    requireAdmin(req, reply);

    const auditPath = path.join(dataDir, "audit.jsonl");
    try {
      const content = await fs.readFile(auditPath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      return lines.reverse().slice(0, 100); // Last 100 events
    } catch {
      return [];
    }
  });

  // POST /api/admin/research/run - Trigger research now with Groq
  let researchLock = false;
  app.post("/api/admin/research/run", async (req, reply) => {
    requireAdmin(req, reply);

    if (!groqApiKey) {
      reply.code(400);
      return {
        error: {
          code: "NOT_CONFIGURED",
          message: "GROQ_API_KEY is not set in .env. Add your key to enable automated fare research.",
        },
      };
    }

    if (researchLock) {
      reply.code(409);
      return { error: { code: "CONFLICT", message: "A research task is already currently running." } };
    }

    researchLock = true;
    // Asynchronously perform research with verification
    (async () => {
      try {
        const prompt = `Find the latest official petrol price per litre in Greater Mumbai today.
You must return only a JSON object matching this schema:
{
  "city": "Mumbai",
  "perLitre": <number>,
  "sourceUrl": "<https URL to official source page>",
  "quote": "<exact short quote from page containing the number and Mumbai>"
}`;

        const gResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
          }),
        });

        if (!gResp.ok) {
          throw new Error(`Groq API returned ${gResp.status}`);
        }

        const data = (await gResp.json()) as any;
        const replyText = data.choices?.[0]?.message?.content || "";
        const jsonMatch = replyText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON in Groq response");

        const parsed = JSON.parse(jsonMatch[0]);

        // Run independent verification
        const verification = await verifyProposal({
          city: parsed.city,
          sourceUrl: parsed.sourceUrl,
          quote: parsed.quote,
          proposedNumbers: [parsed.perLitre],
        });

        const proposal: Proposal = {
          id: crypto.randomUUID(),
          city: parsed.city,
          type: "petrol",
          proposedData: { perLitre: parsed.perLitre },
          sourceUrl: parsed.sourceUrl,
          quote: parsed.quote,
          verification,
          status: "pending",
          createdAt: new Date().toISOString(),
        };

        await storage.update("proposals.json", ProposalsFileSchema, [], (list) => [...list, proposal]);
        await storage.appendAudit({
          action: "PROPOSAL_CREATED",
          proposalId: proposal.id,
          verified: verification.verified,
        });
      } catch (err: unknown) {
        await storage.appendAudit({ action: "RESEARCH_ERROR", error: (err as Error).message });
      } finally {
        researchLock = false;
      }
    })();

    return { ok: true, message: "Fare research started in background. Check proposals shortly." };
  });
}
