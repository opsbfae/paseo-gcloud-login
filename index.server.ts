import type { PluginServerContext } from "@getpaseo/plugin/server";
import { cancelLoginRpc, submitCodeRpc } from "./shared/login";
import { cancelLogin, stopAllLogins, submitCode } from "./server/login-session";
import { gcloudLoginTool, gcloudLoginWaitTool } from "./server/tool";

export default function contribute(server: PluginServerContext) {
  server.handle(submitCodeRpc, ({ sessionId, code }) => submitCode(sessionId, code));
  server.handle(cancelLoginRpc, ({ sessionId }) => cancelLogin(sessionId));

  // Interactive agents on this host can start a sign-in; background agents have nobody watching.
  server.addHook("agent.open.before", async ({ request }) =>
    request.background ? undefined : { ...request, tools: [...request.tools, gcloudLoginTool, gcloudLoginWaitTool] },
  );

  return () => stopAllLogins().then(() => undefined);
}
