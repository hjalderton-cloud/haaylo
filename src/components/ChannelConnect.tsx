import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CARD } from "@/components/AppShell";
import { GREY, LINE, NAVY } from "@/lib/theme";
import { PlatformIcon, platformLabel } from "@/components/PlatformIcon";
import {
  ZERNIO_PLATFORMS,
  disconnectZernioAccount,
  listZernioConnections,
  startZernioConnect,
  type ZernioConnection,
  type ZernioPlatform,
} from "@/lib/zernio.functions";

/**
 * The OAuth connect grid (one row per platform). Shared by the standalone
 * Connect page and the Strategy Profile setup wizard.
 */
export function ChannelConnect({ returnUrl, platforms }: { returnUrl?: string; platforms?: readonly ZernioPlatform[] }) {
  const [connections, setConnections] = useState<ZernioConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const listFn = useServerFn(listZernioConnections);
  const connectFn = useServerFn(startZernioConnect);
  const disconnectFn = useServerFn(disconnectZernioAccount);

  const shown = platforms ?? ZERNIO_PLATFORMS;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFn({ data: undefined });
      if (res.ok) {
        setConnections(res.connections);
        setError(null);
      } else {
        setConnections([]);
        setError(res.error);
      }
    } catch {
      setError("Could not load your accounts just now.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
    const params = new URLSearchParams(window.location.search);
    if (params.get("returned") === "1") {
      toast.success("Account linked.");
    }
  }, [refresh]);

  async function connect(platform: ZernioPlatform) {
    setBusy(platform);
    try {
      const res = await connectFn({
        data: { platform, returnUrl: returnUrl ?? `${window.location.origin}/connect?returned=1` },
      });
      if (res.ok) window.location.href = res.url;
      else toast.error(res.error);
    } catch {
      toast.error("Could not start the connection.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(accountId: string) {
    setBusy(accountId);
    try {
      const res = await disconnectFn({ data: { accountId } });
      if (res.ok) {
        toast.success("Account removed.");
        await refresh();
      } else toast.error(res.error);
    } catch {
      toast.error("Could not remove that account.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error && (
        <div
          style={{
            ...CARD,
            borderColor: "rgba(250,204,21,0.4)",
            color: "#FACC15",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}
      {shown.map((platform) => {
        const linked = connections.filter((c) => c.platform === platform);
        return (
          <div key={platform} style={{ ...CARD, display: "grid", gap: 10, marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <PlatformIcon platform={platform} size={18} />
              <strong style={{ color: "#FFFFFF", fontSize: 15 }}>
                {platformLabel(platform)}
              </strong>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => void connect(platform)}
                disabled={busy === platform}
                style={{
                  background: "#6E1FE0",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 16px",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: busy === platform ? "wait" : "pointer",
                }}
              >
                {busy === platform
                  ? "Opening…"
                  : linked.length > 0
                    ? "Add another"
                    : "Connect"}
              </button>
            </div>

            {loading ? (
              <span style={{ fontSize: 13, color: GREY }}>Checking…</span>
            ) : linked.length === 0 ? (
              <span style={{ fontSize: 13, color: GREY }}>
                Not connected
              </span>
            ) : (
              linked.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    color: NAVY,
                  }}
                >
                  {c.avatarUrl && (
                    <img
                      src={c.avatarUrl}
                      alt=""
                      width={22}
                      height={22}
                      style={{ borderRadius: 999 }}
                    />
                  )}
                  <span>{c.displayName ?? "Connected account"}</span>
                  <span
                    style={{
                      color: c.status === "active" ? "#86efac" : "#FACC15",
                      fontWeight: 700,
                    }}
                  >
                    {c.status === "active" ? "Live" : c.status}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => void disconnect(c.id)}
                    disabled={busy === c.id}
                    style={{
                      background: "transparent",
                      color: GREY,
                      border: `1px solid ${LINE}`,
                      borderRadius: 999,
                      padding: "5px 12px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {busy === c.id ? "Removing…" : "Disconnect"}
                  </button>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
