import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import {
  JsonFileStorage,
  UsersFileSchema,
  SessionsFileSchema,
  User,
  Session,
} from "../storage/index.js";
import { hashPassword, verifyPassword, sha256 } from "../lib/crypto.js";
import { z } from "zod";

const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
});

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: User;
    currentSession?: Session;
  }
}

export function registerAuthRoutes(app: FastifyInstance, storage: JsonFileStorage) {
  // Session cookie reader hook
  app.addHook("preHandler", async (req: FastifyRequest) => {
    const rawToken = req.cookies.mz_session;
    if (rawToken) {
      const tokenHash = sha256(rawToken);
      const sessions = await storage.read("sessions.json", SessionsFileSchema, []);
      const foundSession = sessions.find(
        (s) => s.tokenHash === tokenHash && new Date(s.expiresAt).getTime() > Date.now()
      );

      if (foundSession) {
        const users = await storage.read("users.json", UsersFileSchema, []);
        const user = users.find((u) => u.id === foundSession.userId);
        if (user) {
          req.currentUser = user;
          req.currentSession = foundSession;
        }
      }
    }

    // API resources are private by default. Auth entrypoints and operational
    // endpoints remain public so a new route cannot accidentally bypass auth.
    const pathname = req.url.split("?")[0] || "";
    const publicRoute =
      pathname.startsWith("/api/auth/") ||
      pathname.startsWith("/api/health") ||
      pathname === "/api/config";
    if (pathname.startsWith("/api/") && !publicRoute && !req.currentSession) {
      throw Object.assign(new Error("Authentication required"), { statusCode: 401, code: "UNAUTHENTICATED" });
    }
  });

  // CSRF verification on state-changing requests if signed in
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const path = req.url.split("?")[0] || "";
      if (path === "/api/auth/register" || path === "/api/auth/login" || path.startsWith("/api/plan")) {
        return;
      }
      if (req.currentSession) {
        const clientCsrf = req.headers["x-csrf-token"];
        if (!clientCsrf || clientCsrf !== req.currentSession.csrfToken) {
          reply.code(403);
          throw new Error("Invalid or missing CSRF token");
        }
      }
    }
  });

  // POST /api/auth/register
  app.post("/api/auth/register", async (req, reply) => {
    const parsed = RegisterBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message || "Invalid input" } };
    }

    const { email, password, displayName } = parsed.data;
    const normEmail = email.toLowerCase().trim();

    const users = await storage.read("users.json", UsersFileSchema, []);
    const existing = users.find((u) => u.email === normEmail);
    if (existing) {
      reply.code(409);
      return { error: { code: "CONFLICT", message: "An account with this email already exists" } };
    }

    const isFirstUser = users.length === 0;
    const role = isFirstUser ? "admin" : "user";
    const now = new Date().toISOString();
    const pwHash = await hashPassword(password);

    const newUser: User = {
      id: crypto.randomUUID(),
      email: normEmail,
      passwordHash: pwHash,
      displayName: displayName.trim(),
      role,
      createdAt: now,
      updatedAt: now,
    };

    await storage.update("users.json", UsersFileSchema, [], (list) => [...list, newUser]);

    await storage.appendAudit({
      action: "USER_REGISTERED",
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    // Auto login: generate session
    const rawSessionToken = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    await storage.update("sessions.json", SessionsFileSchema, [], (sessions) => [
      ...sessions,
      {
        id: crypto.randomUUID(),
        userId: newUser.id,
        tokenHash: sha256(rawSessionToken),
        csrfToken,
        createdAt: now,
        expiresAt,
        userAgent: req.headers["user-agent"],
      },
    ]);

    reply.setCookie("mz_session", rawSessionToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: req.protocol === "https",
      maxAge: 60 * 60 * 24 * 30,
    });

    reply.code(201);
    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role,
      },
      csrfToken,
    };
  });

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, reply) => {
    const parsed = LoginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: "VALIDATION_ERROR", message: "Invalid email or password format" } };
    }

    const { email, password } = parsed.data;
    const users = await storage.read("users.json", UsersFileSchema, []);
    const user = users.find((u) => u.email === email.toLowerCase().trim());

    if (!user) {
      reply.code(401);
      return { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } };
    }

    const validPw = await verifyPassword(password, user.passwordHash);
    if (!validPw) {
      reply.code(401);
      return { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } };
    }

    const rawSessionToken = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(24).toString("hex");
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    await storage.update("sessions.json", SessionsFileSchema, [], (sessions) => [
      ...sessions,
      {
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: sha256(rawSessionToken),
        csrfToken,
        createdAt: now,
        expiresAt,
        userAgent: req.headers["user-agent"],
      },
    ]);

    await storage.appendAudit({
      action: "USER_LOGGED_IN",
      userId: user.id,
    });

    reply.setCookie("mz_session", rawSessionToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: req.protocol === "https",
      maxAge: 60 * 60 * 24 * 30,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      csrfToken,
    };
  });

  // GET /api/auth/me
  app.get("/api/auth/me", async (req, reply) => {
    if (!req.currentUser || !req.currentSession) {
      reply.code(401);
      return { error: { code: "UNAUTHORIZED", message: "Not signed in" } };
    }

    return {
      user: {
        id: req.currentUser.id,
        email: req.currentUser.email,
        displayName: req.currentUser.displayName,
        role: req.currentUser.role,
      },
      csrfToken: req.currentSession.csrfToken,
    };
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.currentSession) {
      const sid = req.currentSession.id;
      await storage.update("sessions.json", SessionsFileSchema, [], (sessions) =>
        sessions.filter((s) => s.id !== sid)
      );
    }

    reply.clearCookie("mz_session", { path: "/" });
    return { ok: true };
  });

  // POST /api/auth/change-password
  app.post("/api/auth/change-password", async (req, reply) => {
    if (!req.currentUser || !req.currentSession) {
      reply.code(401);
      return { error: { code: "UNAUTHORIZED", message: "Not signed in" } };
    }

    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: "VALIDATION_ERROR", message: "Invalid password input" } };
    }

    const { currentPassword, newPassword } = parsed.data;
    const valid = await verifyPassword(currentPassword, req.currentUser.passwordHash);
    if (!valid) {
      reply.code(403);
      return { error: { code: "FORBIDDEN", message: "Current password does not match" } };
    }

    const newHash = await hashPassword(newPassword);
    const userId = req.currentUser.id;
    const currentSessionId = req.currentSession.id;

    await storage.update("users.json", UsersFileSchema, [], (users) =>
      users.map((u) => (u.id === userId ? { ...u, passwordHash: newHash, updatedAt: new Date().toISOString() } : u))
    );

    // Invalidate all other sessions
    await storage.update("sessions.json", SessionsFileSchema, [], (sessions) =>
      sessions.filter((s) => s.userId !== userId || s.id === currentSessionId)
    );

    await storage.appendAudit({ action: "PASSWORD_CHANGED", userId });
    return { ok: true, message: "Password updated successfully; other sessions ended." };
  });
}
