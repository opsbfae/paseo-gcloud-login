import type { PluginClientContext } from "@getpaseo/plugin/client";
import { LoginCardView } from "./client/login-card";
import { LOGIN_CARD_KIND, LOGIN_CARD_VERSION, loginCardSchema } from "./shared/login";

export default function contribute(client: PluginClientContext) {
  client.addTimelineRenderer({
    kind: LOGIN_CARD_KIND,
    version: LOGIN_CARD_VERSION,
    schema: loginCardSchema,
    Component: LoginCardView,
  });
  return () => {};
}
