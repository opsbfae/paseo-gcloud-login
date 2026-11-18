import { openExternalUrl, useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  authCodeSchema,
  cancelLoginRpc,
  submitCodeRpc,
  type LoginCard,
  type LoginStatus,
} from "../shared/login";

type Theme = PluginTimelineItemProps["theme"];

const headline: Record<LoginStatus, string> = {
  starting: "Starting Google Cloud sign-in…",
  waiting: "Google Cloud sign-in needed",
  verifying: "Checking the sign-in…",
  "signed-in": "Signed in to Google Cloud",
  failed: "Google Cloud sign-in failed",
  cancelled: "Google Cloud sign-in cancelled",
};

const statusColor = (theme: Theme, status: LoginStatus): string =>
  ({
    starting: theme.colors.foregroundMuted,
    waiting: theme.colors.statusWarning,
    verifying: theme.colors.foregroundMuted,
    "signed-in": theme.colors.statusSuccess,
    failed: theme.colors.statusDanger,
    cancelled: theme.colors.foregroundMuted,
  })[status];

const useStyles = (theme: Theme, compact: boolean, status: LoginStatus) =>
  useMemo(
    () => ({
      card: {
        gap: 10,
        padding: compact ? 12 : 16,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      title: { color: statusColor(theme, status), fontSize: 15, fontWeight: "600" as const },
      body: { color: theme.colors.foreground, fontSize: 14 },
      muted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      row: { flexDirection: (compact ? "column" : "row") as "column" | "row", gap: 8 },
      input: {
        flex: compact ? undefined : 1,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface0,
      },
      primary: {
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
      },
      primaryText: { color: theme.colors.accentForeground, textAlign: "center" as const },
      secondary: {
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      secondaryText: { color: theme.colors.foreground, textAlign: "center" as const },
    }),
    [theme, compact, status],
  );

export function LoginCardView({ item, theme, layout }: PluginTimelineItemProps<LoginCard>) {
  const card = item.data;
  const styles = useStyles(theme, layout.compact, card.status);
  const toast = useToast();
  const submit = useRpc(submitCodeRpc);
  const cancel = useRpc(cancelLoginRpc);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);

  const openSignIn = () =>
    card.url === undefined
      ? undefined
      : openExternalUrl(card.url).catch(() => toast.error("Could not open your browser."));

  const sendCode = async () => {
    const parsed = authCodeSchema.safeParse(code);
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Check the code.");
    setSending(true);
    try {
      const result = await submit({ sessionId: card.sessionId, code: parsed.data });
      setCode("");
      if (!result.ok) toast.error(result.message);
    } catch {
      toast.error("Could not reach the sign-in. Try again.");
    } finally {
      setSending(false);
    }
  };

  const stopSignIn = () =>
    cancel({ sessionId: card.sessionId }).catch(() => toast.error("Could not cancel."));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{headline[card.status]}</Text>

      {card.status === "waiting" && (
        <>
          <Text style={styles.body}>
            1. Open Google's sign-in and confirm with your passkey. 2. Paste the code Google shows
            here.
          </Text>
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Google sign-in in your browser"
              onPress={openSignIn}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>Open Google sign-in</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={stopSignIn} style={styles.secondary}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <TextInput
              value={code}
              onChangeText={setCode}
              onSubmitEditing={sendCode}
              placeholder="Paste the code, e.g. 4/0A…"
              placeholderTextColor={theme.colors.foregroundMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!sending}
              accessibilityLabel="Google sign-in code"
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Finish sign-in"
              disabled={sending || code.trim() === ""}
              onPress={sendCode}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>{sending ? "Signing in…" : "Finish sign-in"}</Text>
            </Pressable>
          </View>
        </>
      )}

      {card.account !== undefined && <Text style={styles.body}>{card.account}</Text>}
      {card.message !== undefined && <Text style={styles.muted}>{card.message}</Text>}
    </View>
  );
}
