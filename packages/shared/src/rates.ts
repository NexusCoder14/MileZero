import { z } from "zod";

export const SourceCitationSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});
export type SourceCitation = z.infer<typeof SourceCitationSchema>;

export const PetrolPriceSchema = z.object({
  perLitre: z.number().positive(),
  asOf: z.string(),
  source: SourceCitationSchema,
  verified: z.boolean(),
  note: z.string().optional(),
});
export type PetrolPrice = z.infer<typeof PetrolPriceSchema>;

export const SlabTupleSchema = z.tuple([z.number().nullable(), z.number()]);
export type SlabTuple = z.infer<typeof SlabTupleSchema>;

export const BeyondSchema = z.object({
  stepKm: z.number().positive(),
  stepFare: z.number().nonnegative(),
});
export type Beyond = z.infer<typeof BeyondSchema>;

export const FareSchemeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: z.enum(["default", "alternative"]),
  alternativeTo: z.string().optional(),
  match: z.string().nullable().optional(),
  slabs: z.array(SlabTupleSchema),
  beyond: BeyondSchema.optional(),
  asOf: z.string(),
  source: SourceCitationSchema,
  verified: z.boolean(),
  note: z.string().optional(),
});
export type FareScheme = z.infer<typeof FareSchemeSchema>;

export const CityRatesSchema = z.object({
  petrol: PetrolPriceSchema.optional().nullable(),
  fares: z.record(z.string(), z.array(FareSchemeSchema)).optional(),
});
export type CityRates = z.infer<typeof CityRatesSchema>;

export const RatesFileSchema = z.object({
  schema: z.literal(1),
  generatedAt: z.string(),
  cities: z.record(z.string(), CityRatesSchema),
});
export type RatesFile = z.infer<typeof RatesFileSchema>;

