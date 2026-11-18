import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// The timeline card that carries one sign-in from "open Google" to "signed in".
export const LOGIN_CARD_KIND = "gcloud-login";
export const LOGIN_CARD_VERSION = 1;

export const loginStatusSchema = z.enum([
  "starting",
  "waiting",
  "verifying",
  "signed-in",
  "failed",
  "cancelled",
]);

export const loginCardSchema = z.object({
  sessionId: z.string(),
  status: loginStatusSchema,
  url: z.string().url().optional(),
  account: z.string().optional(),
  message: z.string().optional(),
});

export type LoginStatus = z.output<typeof loginStatusSchema>;
export type LoginCard = z.output<typeof loginCardSchema>;

// The code Google shows after consent, e.g. "4/0A…". Never logged, never stored.
export const authCodeSchema = z
  .string()
  .trim()
  .regex(/^\d\/[A-Za-z0-9_-]{20,}$/, "That does not look like a Google sign-in code.");

export const submitCodeRpc = defineRpc({
  name: "gcloud-login.submit-code",
  input: z.object({ sessionId: z.string(), code: authCodeSchema }),
  output: z.object({ ok: z.boolean(), message: z.string() }),
});

export const cancelLoginRpc = defineRpc({
  name: "gcloud-login.cancel",
  input: z.object({ sessionId: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

export const isFinished = (status: LoginStatus): boolean =>
  ["signed-in", "failed", "cancelled"].includes(status);
