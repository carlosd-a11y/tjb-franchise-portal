import { REASON_CODES } from "./model";
import type { ReasonCode } from "../types";

export function explain(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "permission-denied") return "You don't have access to that.";
  if (code === "unauthenticated") return "Sign in again.";
  if (code === "failed-precondition") return "That change is no longer available.";
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong.";
}

export function isReason(value: string): value is ReasonCode {
  return (REASON_CODES as string[]).includes(value);
}
