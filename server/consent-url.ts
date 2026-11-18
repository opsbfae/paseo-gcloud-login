// gcloud prints the consent link it wants the person to open. Only a Google
// accounts URL for the Google Cloud SDK client is ever passed to a browser.

const CONSENT_URL_PATTERN = /https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?\S+/;
const GOOGLE_CLOUD_SDK_CLIENT_ID = "32555940559.apps.googleusercontent.com";

const parseUrl = (candidate: string): URL | undefined => {
  try {
    return new URL(candidate);
  } catch {
    return undefined;
  }
};

const isGoogleCloudSdkConsent = (url: URL): boolean =>
  url.protocol === "https:" &&
  url.hostname === "accounts.google.com" &&
  url.pathname === "/o/oauth2/auth" &&
  url.searchParams.get("client_id") === GOOGLE_CLOUD_SDK_CLIENT_ID;

export const findConsentUrl = (gcloudOutput: string): string | undefined => {
  const candidate = gcloudOutput.match(CONSENT_URL_PATTERN)?.[0];
  const url = candidate === undefined ? undefined : parseUrl(candidate);
  return url !== undefined && isGoogleCloudSdkConsent(url) ? url.toString() : undefined;
};
