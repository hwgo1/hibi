import { z } from "zod";

/** Slug format for all human-readable identifiers */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const SlugSchema = z.string().regex(SLUG);

export const UserIdSchema = z.string().min(1).brand<"UserId">();
export const SessionIdSchema = z.string().min(1).brand<"SessionId">();
export const IntentIdSchema = z.string().min(1).brand<"IntendId">();
export const FindingIdSchema = z.string().min(1).brand<"FindingId">();
export const EvidenceIdSchema = z.string().min(1).brand<"EvidenceId">();

export type UserId = z.infer<typeof UserIdSchema>;
export type SessionId = z.infer<typeof SessionIdSchema>;
export type IntentId = z.infer<typeof IntentIdSchema>;
export type FindingId = z.infer<typeof FindingIdSchema>;
export type EvidenceId = z.infer<typeof EvidenceIdSchema>;

/** ISO 8601 timestamp */
export const IsoDateTimeSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "invalid ISO timestamp");

export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const UnitIntervalSchema = z.number().min(0).max(1);
