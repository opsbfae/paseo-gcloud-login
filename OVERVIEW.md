Signs a Paseo host's gcloud CLI in to Google Cloud from a card in the agent's timeline, so the sign-in opens in the browser on the device you are using rather than on the host.

When a gcloud command on the host needs a fresh sign-in, the agent calls the `gcloud_login` tool, which returns once the card is showing; the agent then calls `gcloud_login_wait` (up to 4 minutes per call) until the sign-in ends. The host starts `gcloud auth login --update-adc --no-launch-browser` and the card appears. Press "Open Google sign-in" to open Google's consent page in your system browser (desktop), a new tab (web) or your phone's browser (mobile), confirm with your passkey, and paste the code Google shows into the card. The plugin passes the code to the waiting gcloud process, then checks that both gcloud's token and the application-default credentials refresh, and tells the agent the result.

Setup: gcloud must be installed and on the daemon's `PATH`. Requires Paseo 0.16 or later.

What it reads and sends: the card only ever opens a Google accounts URL for the Google Cloud SDK client. The code goes from the card to the gcloud process's input and is not logged, stored or shown to the agent. Tokens printed during the check are discarded. One sign-in runs at a time; a new one cancels the old, and a sign-in gives up after 9 minutes. Background agents do not get the tool.
