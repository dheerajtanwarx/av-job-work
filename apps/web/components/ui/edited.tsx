import type { EditMark } from "@av/shared";
import { PencilLine } from "lucide-react";
import { formatDateTime } from "@/components/billing/notification-status";
import { cn } from "@/lib/utils";

/** "Edited by Anil · 06 Oct 2026, 3:42 pm". */
export const editedText = (e: EditMark) => `Edited by ${e.by ?? "a removed user"} · ${formatDateTime(e.at)}`;

/**
 * Marks a record that someone changed after it was saved, and says who. `compact` (lists) shows a short
 * "Edited" chip with the details on hover; the full form (detail headers) spells them out.
 */
export function EditedTag({ edited, compact, className }: { edited: EditMark | null | undefined; compact?: boolean; className?: string }) {
  if (!edited) return null;
  const text = editedText(edited);
  return (
    <span
      title={text}
      className={cn("inline-flex h-5 items-center gap-1 rounded px-1.5 text-xs leading-none font-medium whitespace-nowrap", "bg-warning-subtle text-warning", className)}
    >
      <PencilLine className="size-3 shrink-0" aria-hidden />
      {compact ? (
        <>
          Edited<span className="sr-only"> {text.slice("Edited ".length)}</span>
        </>
      ) : (
        <span className="truncate">{text}</span>
      )}
    </span>
  );
}
