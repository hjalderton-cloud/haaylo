/**
 * Package shelf: the package-first home for saved work.
 * Each card is one creation session (a batch of posts, a campaign, a plan,
 * a landing page). Packages reference the real asset rows, never copies.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listWorkPackages,
  groupOlderWork,
  updateWorkPackage,
  type WorkPackage,
  type StageCounts,
  type PackageType,
} from "@/lib/packages.functions";
import { CARD } from "@/components/AppShell";
import { NAVY, INDIGO, PURPLE, PINK, GREY, LINE, TINT, font } from "@/lib/theme";

export type PackageWithCounts = WorkPackage & { counts: StageCounts };

const TYPE_STYLE: Record<PackageType, { label: string; fg: string; bg: string }> = {
  post_batch: { label: "Post set", fg: TINT.blueInk, bg: TINT.blue },
  landing_page: { label: "Landing page", fg: TINT.pinkInk, bg: TINT.pink },
  content_plan: { label: "Content plan", fg: TINT.purpleInk, bg: TINT.purple },
  strategy: { label: "90-day strategy", fg: TINT.greenInk, bg: TINT.green },
  campaign: { label: "Campaign", fg: TINT.pinkInk, bg: TINT.pink },
  email_sequence: { label: "Email sequence", fg: TINT.blueInk, bg: TINT.blue },
  lead_magnet: { label: "Lead magnet", fg: TINT.purpleInk, bg: TINT.purple },
  image_pack: { label: "Image pack", fg: TINT.greenInk, bg: TINT.green },
  standalone: { label: "Standalone", fg: GREY, bg: "#F1F2F6" },
};

const TYPE_FILTERS: Array<{ v: "" | PackageType; label: string }> = [
  { v: "", label: "All types" },
  { v: "campaign", label: "Campaigns" },
  { v: "post_batch", label: "Post sets" },
  { v: "content_plan", label: "Content plans" },
  { v: "strategy", label: "Strategies" },
  { v: "landing_page", label: "Landing pages" },
  { v: "email_sequence", label: "Emails" },
  { v: "lead_magnet", label: "Lead magnets" },
  { v: "image_pack", label: "Image packs" },
];

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function stageLine(c: StageCounts): string {
  if (c.total === 0) return "Empty package";
  const parts: string[] = [];
  if (c.published) parts.push(`${c.published} published`);
  if (c.scheduled) parts.push(`${c.scheduled} scheduled`);
  if (c.approved) parts.push(`${c.approved} approved`);
  if (c.draft) parts.push(`${c.draft} draft${c.draft === 1 ? "" : "s"}`);
  return `${c.total} item${c.total === 1 ? "" : "s"} · ${parts.join(", ")}`;
}

export function PackageShelf({
  projectId,
  onOpen,
}: {
  projectId: string;
  onOpen: (pkg: PackageWithCounts) => void;
}) {
  const listFn = useServerFn(listWorkPackages);
  const updateFn = useServerFn(updateWorkPackage);
  const groupFn = useServerFn(groupOlderWork);
  const [grouping, setGrouping] = useState(false);

  async function group() {
    setGrouping(true);
    try {
      const r = await groupFn({ data: { projectId } });
      const made = r.campaigns + r.postSets + r.landingPages + r.strategies + r.standalone;
      toast.success(made || r.itemsFiled ? `Grouped ${r.itemsFiled} items into ${made} new package${made === 1 ? "" : "s"}. Nothing was deleted.` : "Everything is already in a package.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not group your older work.");
    } finally {
      setGrouping(false);
    }
  }
  const [packages, setPackages] = useState<PackageWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"" | PackageType>("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listFn({ data: { projectId, type: type || null } });
      setPackages(rows as PackageWithCounts[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load your packages.");
    } finally {
      setLoading(false);
    }
  }, [listFn, projectId, type]);

  useEffect(() => {
    void load();
  }, [load]);

  async function archive(pkg: PackageWithCounts) {
    setBusy(pkg.id);
    try {
      await updateFn({ data: { id: pkg.id, archived: true } });
      setPackages((prev) => prev.filter((p) => p.id !== pkg.id));
      toast.success("Package archived. The work inside it is untouched.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive that package.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setType(f.v)}
            style={{
              padding: "7px 12px",
              borderRadius: 999,
              border: `1px solid ${type === f.v ? PINK : LINE}`,
              background: type === f.v ? TINT.pink : "#FFFFFF",
              color: "inherit",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: font,
            }}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => void group()}
          disabled={grouping}
          title="Packages your older posts, pages and plans using the links they already have. Nothing is deleted."
          style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 999, border: `1px solid ${LINE}`, background: "#FFFFFF", color: INDIGO, fontSize: 12, fontWeight: 700, cursor: grouping ? "wait" : "pointer", fontFamily: font }}
        >
          {grouping ? "Grouping…" : "Group my older work"}
        </button>
      </div>

      {loading ? (
        <div style={{ ...CARD, opacity: 0.75 }}>Loading your packages…</div>
      ) : packages.length === 0 ? (
        <div style={{ ...CARD, padding: 32, textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 600, color: NAVY }}>
            No packages yet. Everything new you generate saves itself as a package from now on.
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.7 }}>
            Older work is still in the Active content and Archive tabs, exactly where it was.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
            gap: 12,
            alignItems: "start",
          }}
        >
          {packages.map((pkg) => {
            const t = TYPE_STYLE[pkg.package_type] ?? TYPE_STYLE.standalone;
            return (
              <div
                key={pkg.id}
                style={{
                  ...CARD,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  opacity: busy === pkg.id ? 0.55 : 1,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 9px",
                      borderRadius: 999,
                      color: t.fg,
                      background: t.bg,
                    }}
                  >
                    {t.label}
                  </span>
                  <span style={{ fontSize: 11, color: GREY }}>{when(pkg.created_at)}</span>
                </div>
                <strong style={{ fontSize: 15, lineHeight: 1.35, color: NAVY }}>{pkg.title}</strong>
                <span style={{ fontSize: 12, color: GREY }}>{stageLine(pkg.counts)}</span>
                <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
                  <button
                    onClick={() => onOpen(pkg)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: PURPLE,
                      color: "#FFFFFF",
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: font,
                    }}
                  >
                    Open package
                  </button>
                  <button
                    onClick={() => void archive(pkg)}
                    disabled={busy === pkg.id}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: `1px solid ${LINE}`,
                      background: "#FFFFFF",
                      color: INDIGO,
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: font,
                    }}
                  >
                    Archive
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
