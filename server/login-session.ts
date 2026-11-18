import { randomUUID } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { AgentToolContext } from "@getpaseo/plugin/server";
import {
  LOGIN_CARD_KIND,
  LOGIN_CARD_VERSION,
  isFinished,
  type LoginCard,
  type LoginStatus,
} from "../shared/login";
import { findConsentUrl } from "./consent-url";
import {
  activeAccount,
  checkCredentials,
  describeFailedCheck,
  lastErrorLine,
  startLoginProcess,
} from "./gcloud";

// Agent tool calls are capped at 10 minutes; finish comfortably inside that.
const LOGIN_TIMEOUT_MS = 9 * 60_000;
// How long the start call waits for gcloud to print its consent link.
const SHOW_TIMEOUT_MS = 30_000;

type Paseo = AgentToolContext["paseo"];
type CardPatch = Omit<LoginCard, "sessionId" | "url">;

interface LoginSession {
  readonly id: string;
  readonly child: ChildProcessWithoutNullStreams;
  readonly publish: (card: LoginCard) => Promise<void>;
  readonly finished: Promise<LoginCard>;
  readonly settle: (card: LoginCard) => void;
  readonly shown: Promise<void>;
  readonly markShown: () => void;
  status: LoginStatus;
  output: string;
  url?: string;
}

const sessions = new Map<string, LoginSession>();
let latest: LoginSession | undefined;

const cardPublisher =
  (paseo: Paseo, agentId: string, sessionId: string) =>
  (card: LoginCard): Promise<void> =>
    paseo.agents
      .ref(agentId)
      .timeline.append({
        type: "plugin",
        id: `gcloud-login-${sessionId}`,
        kind: LOGIN_CARD_KIND,
        version: LOGIN_CARD_VERSION,
        data: { ...card },
      })
      .then(() => undefined)
      .catch((error: unknown) =>
        console.error("gcloud-login: could not update the card:", errorMessage(error)),
      );

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// The status changes before the card is published, so later events see it at once.
const update = (session: LoginSession, patch: CardPatch): Promise<void> => {
  session.status = patch.status;
  return session.publish({ sessionId: session.id, url: session.url, ...patch });
};

const finish = async (session: LoginSession, patch: CardPatch): Promise<void> => {
  if (isFinished(session.status)) return;
  await update(session, patch);
  session.settle({ sessionId: session.id, url: session.url, ...patch });
};

const stop = (session: LoginSession, patch: CardPatch): Promise<void> => {
  if (isFinished(session.status)) return Promise.resolve();
  session.child.kill("SIGTERM");
  return finish(session, patch);
};

const verifySignIn = async (session: LoginSession): Promise<void> => {
  const [account, check] = await Promise.all([activeAccount(), checkCredentials()]);
  const problem = describeFailedCheck(check);
  return problem
    ? finish(session, { status: "failed", account, message: `Signed in, but ${problem}.` })
    : finish(session, {
        status: "signed-in",
        account,
        message: "gcloud and application-default credentials both refresh.",
      });
};

const onExit = (session: LoginSession, exitCode: number | null): Promise<void> => {
  if (isFinished(session.status)) return Promise.resolve();
  return exitCode === 0
    ? verifySignIn(session)
    : finish(session, {
        status: "failed",
        message: lastErrorLine(session.output) ?? `gcloud exited with code ${exitCode}.`,
      });
};

const onOutput = (session: LoginSession) => (chunk: Buffer) => {
  session.output += chunk.toString();
  if (session.url !== undefined) return;
  session.url = findConsentUrl(session.output);
  if (session.url === undefined) return;
  void update(session, { status: "waiting" });
  session.markShown();
};

const createSession = (paseo: Paseo, agentId: string): LoginSession => {
  const id = randomUUID();
  let settle: (card: LoginCard) => void = () => {};
  const finished = new Promise<LoginCard>((resolve) => {
    settle = resolve;
  });
  let markShown: () => void = () => {};
  const shown = new Promise<void>((resolve) => {
    markShown = resolve;
  });
  return {
    id,
    child: startLoginProcess(),
    publish: cardPublisher(paseo, agentId, id),
    finished,
    settle,
    shown,
    markShown,
    status: "starting",
    output: "",
  };
};

const watch = (session: LoginSession): void => {
  session.child.stdout.on("data", onOutput(session));
  session.child.stderr.on("data", onOutput(session));
  session.child.on("error", (error) =>
    void finish(session, { status: "failed", message: `Could not start gcloud: ${error.message}` }),
  );
  session.child.on("close", (exitCode) => void onExit(session, exitCode));
};

const stopAll = (message: string): Promise<void[]> =>
  Promise.all([...sessions.values()].map((session) => stop(session, { status: "cancelled", message })));

export const startLogin = async ({
  agent,
  paseo,
}: Pick<AgentToolContext, "agent" | "paseo">): Promise<LoginCard> => {
  await stopAll("A newer sign-in replaced this one.");
  const session = createSession(paseo, agent.id);
  sessions.set(session.id, session);
  latest = session;
  watch(session);
  void update(session, { status: "starting" });

  const timeout = setTimeout(
    () => void stop(session, { status: "failed", message: "Timed out after 9 minutes with no code." }),
    LOGIN_TIMEOUT_MS,
  );
  void session.finished.then(() => {
    clearTimeout(timeout);
    sessions.delete(session.id);
  });

  // Return once the card can be acted on, so the tool call stays short.
  return Promise.race([session.shown, session.finished, delay(SHOW_TIMEOUT_MS)]).then(() =>
    currentCard(session),
  );
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const currentCard = (session: LoginSession): LoginCard => ({
  sessionId: session.id,
  status: session.status,
  url: session.url,
});

// Waits for the latest sign-in to finish, for at most `ms`. MCP clients abort
// tool calls that stay silent for 5 minutes, so callers wait in rounds.
export const waitForLogin = async (ms: number): Promise<LoginCard | undefined> => {
  const session = latest;
  if (session === undefined) return undefined;
  const finished = await Promise.race([session.finished, delay(ms).then(() => undefined)]);
  return finished ?? currentCard(session);
};

export const submitCode = async (
  sessionId: string,
  code: string,
): Promise<{ ok: boolean; message: string }> => {
  const session = sessions.get(sessionId);
  if (session === undefined) {
    return { ok: false, message: "This sign-in has ended. Ask the agent to start a new one." };
  }
  if (session.status !== "waiting") {
    return { ok: false, message: "This sign-in is not waiting for a code." };
  }
  void update(session, { status: "verifying" });
  session.child.stdin.end(`${code}\n`);
  const card = await session.finished;
  return { ok: card.status === "signed-in", message: card.message ?? card.status };
};

export const cancelLogin = async (sessionId: string): Promise<{ ok: boolean }> => {
  const session = sessions.get(sessionId);
  if (session === undefined) return { ok: false };
  await stop(session, { status: "cancelled", message: "Cancelled from the card." });
  return { ok: true };
};

export const stopAllLogins = (): Promise<void[]> => stopAll("The sign-in plugin stopped.");
