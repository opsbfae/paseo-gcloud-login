import { defineAgentTool } from "@getpaseo/plugin/server";
import { z } from "zod";
import type { LoginCard } from "../shared/login";
import { startLogin, waitForLogin } from "./login-session";

// MCP clients abort a tool call that stays silent for 5 minutes; wait in shorter rounds.
const WAIT_ROUND_MS = 4 * 60_000;

const resultText = (card: LoginCard): string =>
  ({
    starting: "The sign-in is starting; gcloud has not printed its link yet. Call gcloud_login_wait.",
    waiting:
      "The sign-in card is showing in the person's Paseo app. Tell them to press 'Open Google sign-in', confirm with their passkey and paste the code into the card (not chat). Then call gcloud_login_wait.",
    verifying: "The person submitted the code; gcloud is finishing. Call gcloud_login_wait.",
    "signed-in": `Signed in to Google Cloud as ${card.account ?? "the active account"}. ${card.message ?? ""} Retry the command that failed.`,
    failed: `Google Cloud sign-in failed: ${card.message ?? "no detail"}`,
    cancelled: `Google Cloud sign-in was cancelled: ${card.message ?? "no detail"}`,
  })[card.status].trim();

const toResult = (card: LoginCard) => ({
  text: resultText(card),
  structuredContent: { status: card.status, account: card.account },
  isError: card.status === "failed" || card.status === "cancelled",
});

export const gcloudLoginTool = defineAgentTool({
  name: "gcloud_login",
  title: "Sign in to Google Cloud",
  description: [
    "Sign this machine's gcloud CLI and application-default credentials in to Google Cloud.",
    "Use it whenever a gcloud, tofu or Google client command fails with 'Reauthentication failed',",
    "'Reauthentication is needed', invalid_rapt, 'credentials have expired' or a 401 from a Google API.",
    "It shows the person a card that opens Google's sign-in in their own browser; they confirm with",
    "their passkey and paste the code into the card. Returns as soon as the card is showing;",
    "then call gcloud_login_wait until it reports signed-in, failed or cancelled.",
    "Do not ask the person to paste the code into chat.",
  ].join(" "),
  input: z.object({}),
  async execute(_input, context) {
    return toResult(await startLogin(context));
  },
});

export const gcloudLoginWaitTool = defineAgentTool({
  name: "gcloud_login_wait",
  title: "Wait for the Google Cloud sign-in",
  description: [
    "Wait up to 4 minutes for the sign-in started by gcloud_login to finish.",
    "Call it again while it reports the sign-in is still waiting or verifying;",
    "the sign-in itself gives up after 9 minutes.",
  ].join(" "),
  input: z.object({}),
  async execute() {
    const card = await waitForLogin(WAIT_ROUND_MS);
    return card === undefined
      ? { text: "No sign-in has been started. Call gcloud_login first.", isError: true }
      : toResult(card);
  },
});
