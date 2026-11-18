import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const CHECK_TIMEOUT_MS = 30_000;

// Tokens are printed to stdout by these commands; stdout is read only for
// success and then dropped, never logged or returned.
const succeeds = (args: string[]): Promise<boolean> =>
  run("gcloud", args, { timeout: CHECK_TIMEOUT_MS }).then(
    () => true,
    () => false,
  );

export const startLoginProcess = (): ChildProcessWithoutNullStreams =>
  spawn("gcloud", ["auth", "login", "--update-adc", "--no-launch-browser"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

export const activeAccount = async (): Promise<string | undefined> => {
  const { stdout } = await run(
    "gcloud",
    ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"],
    { timeout: CHECK_TIMEOUT_MS },
  ).catch(() => ({ stdout: "" }));
  return stdout.trim() || undefined;
};

export interface CredentialCheck {
  gcloud: boolean;
  applicationDefault: boolean;
}

export const checkCredentials = async (): Promise<CredentialCheck> => {
  const [gcloud, applicationDefault] = await Promise.all([
    succeeds(["auth", "print-access-token"]),
    succeeds(["auth", "application-default", "print-access-token"]),
  ]);
  return { gcloud, applicationDefault };
};

export const describeFailedCheck = ({ gcloud, applicationDefault }: CredentialCheck): string =>
  [
    gcloud ? undefined : "gcloud's token does not refresh",
    applicationDefault ? undefined : "application-default credentials do not refresh",
  ]
    .filter((problem): problem is string => problem !== undefined)
    .join("; ");

// gcloud's own error lines, without the advice it prints after them.
export const lastErrorLine = (gcloudOutput: string): string | undefined =>
  gcloudOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("ERROR:"))
    .at(-1);
