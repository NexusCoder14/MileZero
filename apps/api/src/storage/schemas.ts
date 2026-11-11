import { z } from "zod";
import { RatesFileSchema } from "@milezero/shared";

// Users
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  passwordHash: z.string(),
  displayName: z.string().min(1),
  role: z.enum(["admin", "user"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const UsersFileSchema = z.array(UserSchema);
export type UsersFile = z.infer<typeof UsersFileSchema>;

// Sessions
export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tokenHash: z.string(),
  csrfToken: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  userAgent: z.string().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionsFileSchema = z.array(SessionSchema);
export type SessionsFile = z.infer<typeof SessionsFileSchema>;

// Trips
export const LoggedTripSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  loggedAt: z.string(),
  fromName: z.string().optional(),
  toName: z.string().optional(),
  mode: z.string(),
  distanceKm: numberSchema(),
  durationMinutes: numberSchema(),
  cost: z.number().nullable(),
  co2Kg: numberSchema(),
  co2SavedKg: numberSchema(),
  planToken: z.string(),
});
export type LoggedTrip = z.infer<typeof LoggedTripSchema>;

function numberSchema() {
  return z.number();
}

export const TripsFileSchema = z.array(LoggedTripSchema);
export type TripsFile = z.infer<typeof TripsFileSchema>;

// Groups
export const GroupMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "member"]),
  joinedAt: z.string(),
});

export const GroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  joinCode: z.string().min(4),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  members: z.array(GroupMemberSchema),
});
export type Group = z.infer<typeof GroupSchema>;

export const GroupsFileSchema = z.array(GroupSchema);
export type GroupsFile = z.infer<typeof GroupsFileSchema>;

// Challenges
export const ChallengeSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  title: z.string().min(1),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(),   // YYYY-MM-DD
  targetMode: z.string().optional(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
});
export type Challenge = z.infer<typeof ChallengeSchema>;

export const ChallengesFileSchema = z.array(ChallengeSchema);
export type ChallengesFile = z.infer<typeof ChallengesFileSchema>;

// Fare / Petrol Research Proposals
export const ProposalSchema = z.object({
  id: z.string().uuid(),
  city: z.string(),
  type: z.enum(["petrol", "fare"]),
  proposedData: z.record(z.string(), z.unknown()),
  sourceUrl: z.string().url(),
  quote: z.string(),
  verification: z.object({
    verified: z.boolean(),
    checkedAt: z.string(),
    reason: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  status: z.enum(["pending", "approved", "rejected", "published"]),
  createdAt: z.string(),
  reviewedBy: z.string().uuid().optional(),
  reviewedAt: z.string().optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const ProposalsFileSchema = z.array(ProposalSchema);
export type ProposalsFile = z.infer<typeof ProposalsFileSchema>;

export { RatesFileSchema };
