import { useState } from "react";
import { WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NAVY } from "@/lib/theme";

export function ImageTweakControl({
  onApply,
  disabled = false,
  compact = false,
}: {
  onApply: (instruction: string) => Promise<void>;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply() {
    const value = instruction.trim();
    if (value.length < 3) {
      setError("Describe the change you want.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onApply(value);
      setInstruction("");
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That image could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        <WandSparkles className="mr-1.5 h-3.5 w-3.5" /> Tweak image
      </Button>
    );
  }

  return (
    <div className={compact ? "grid w-full gap-2" : "grid w-full gap-2 rounded-md border border-border bg-background p-3"}>
      <Input
        autoFocus
        value={instruction}
        maxLength={500}
        disabled={busy}
        aria-label="Describe the image change"
        placeholder="Make the desk brighter, use fewer objects…"
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void apply();
          if (event.key === "Escape") setOpen(false);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={busy || instruction.trim().length < 3} onClick={() => void apply()}>
          {busy ? "Applying…" : "Apply tweak"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setError(""); }}>
          Cancel
        </Button>
        {error ? <span className="text-xs" style={{ color: NAVY }}>{error}</span> : null}
      </div>
    </div>
  );
}