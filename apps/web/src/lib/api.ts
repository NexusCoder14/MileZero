import { z } from "zod";
import { HealthResponse, PlanResult, PlanQuery } from "@milezero/shared";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

let storedCsrfToken = "";

export function setCsrfToken(token: string) {
  storedCsrfToken = token;
}

export function getCsrfToken(): string {
  return storedCsrfToken;
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  schema?: z.ZodType<T>,
  acceptStatuses: number[] = []
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("accept", "application/json");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(options.method?.toUpperCase() || "")) {
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (storedCsrfToken && !headers.has("x-csrf-token")) {
      headers.set("x-csrf-token", storedCsrfToken);
    }
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    throw new ApiError("The MileZero service is not reachable.", 0);
  }

  let body: any = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError("The service sent a response that is not JSON.", res.status);
    }
  }

  if (!res.ok && !acceptStatuses.includes(res.status)) {
    const errorMsg = body?.error?.message || `The service answered with HTTP ${res.status}.`;
    const errorCode = body?.error?.code || "ERROR";
    throw new ApiError(errorMsg, res.status, errorCode);
  }

  if (schema && body !== null) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("The service sent a response this app does not understand.", res.status);
    }
    return parsed.data;
  }

  return body as T;
}

// Health & Config
export const fetchHealth = () => requestJson("/api/health", { method: "GET" }, HealthResponse, [503]);
export const fetchTransitStatus = () => requestJson<Record<string, unknown>>("/api/health/transit", { method: "GET" });
export const refreshTransitNetwork = () => requestJson<Record<string, unknown>>("/api/admin/transit/refresh", { method: "POST", body: "{}" });

export const PublicConfigSchema = z.object({
  brand: z.object({ name: z.string(), tagline: z.string() }),
  tileUrlTemplate: z.string().optional(),
  tileAttribution: z.string().optional(),
  operatorName: z.string().optional(),
  jurisdiction: z.string().optional(),
});
export type PublicConfig = z.infer<typeof PublicConfigSchema>;
export const fetchConfig = () => requestJson("/api/config", { method: "GET" }, PublicConfigSchema);

// Geocoding
export interface Place {
  id: string;
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  type?: string;
}

export const searchPlaces = (q: string): Promise<Place[]> =>
  requestJson(`/api/places/search?q=${encodeURIComponent(q)}`, { method: "GET" });

export const reversePlace = (lat: number, lon: number): Promise<Place> =>
  requestJson(`/api/places/reverse?lat=${lat}&lon=${lon}`, { method: "GET" });

// Journey Planning
export const planJourney = (query: PlanQuery): Promise<PlanResult> =>
  requestJson("/api/plan", { method: "POST", body: JSON.stringify(query) });

// Auth
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
}

export interface AuthResponse {
  user: User;
  csrfToken: string;
}

export const registerUser = async (data: { email: string; password: string; displayName: string }): Promise<AuthResponse> => {
  const res = await requestJson<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(data) });
  setCsrfToken(res.csrfToken);
  return res;
};

export const loginUser = async (data: { email: string; password: string }): Promise<AuthResponse> => {
  const res = await requestJson<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(data) });
  setCsrfToken(res.csrfToken);
  return res;
};

export const fetchMe = async (): Promise<AuthResponse | null> => {
  try {
    const res = await requestJson<AuthResponse>("/api/auth/me", { method: "GET" });
    setCsrfToken(res.csrfToken);
    return res;
  } catch {
    return null;
  }
};

export const logoutUser = async (): Promise<void> => {
  await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
  setCsrfToken("");
};

// Trips & Community
export const logTrip = (planToken: string) =>
  requestJson("/api/trips", { method: "POST", body: JSON.stringify({ planToken }) });

export const fetchImpact = () => requestJson("/api/trips/impact", { method: "GET" });

export const fetchGroups = () => requestJson("/api/groups", { method: "GET" });

export const createGroup = (name: string) =>
  requestJson("/api/groups", { method: "POST", body: JSON.stringify({ name }) });

export const joinGroup = (joinCode: string) =>
  requestJson("/api/groups/join", { method: "POST", body: JSON.stringify({ joinCode }) });

export const fetchGroupDetail = (id: string) => requestJson(`/api/groups/${id}`, { method: "GET" });

export const createChallenge = (groupId: string, data: { title: string; startDate: string; endDate: string; targetMode?: string }) =>
  requestJson(`/api/groups/${groupId}/challenges`, { method: "POST", body: JSON.stringify(data) });

// Admin
export const fetchProposals = () => requestJson("/api/admin/proposals", { method: "GET" });

export const publishProposal = (id: string) =>
  requestJson(`/api/admin/proposals/${id}/publish`, { method: "POST" });

export const dismissProposal = (id: string) =>
  requestJson(`/api/admin/proposals/${id}/dismiss`, { method: "POST" });

export const setManualPetrol = (city: string, perLitre: number, note?: string) =>
  requestJson("/api/admin/petrol/manual", { method: "POST", body: JSON.stringify({ city, perLitre, note }) });

export const fetchAuditLog = () => requestJson("/api/admin/audit", { method: "GET" });
export const fetchAdminUsers = () => requestJson<Array<{ id: string; email: string; displayName: string; role: string }>>("/api/admin/users", { method: "GET" });
export const setTemporaryPassword = (id: string) =>
  requestJson<{ userId: string; displayName: string; temporaryPassword: string; message: string }>(
    `/api/admin/users/${id}/temporary-password`,
    { method: "POST", body: "{}" }
  );

export const triggerResearch = () => requestJson("/api/admin/research/run", { method: "POST" });
