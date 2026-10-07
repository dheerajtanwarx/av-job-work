import { NOTIFY_STATUS_LABEL, type NotifyStatus } from "@av/shared";
import { StatusBadge, type Tone } from "@/components/ui/badge";

const tone: Record<NotifyStatus, Tone> = { sent: "success", failed: "danger", skipped: "neutral", pending: "info" };

/** Sent / Failed / Not sent / Sending – colour plus a text label. */
export function NotificationStatusBadge({ status }: { status: string }) {
  const s = (status in tone ? status : "skipped") as NotifyStatus;
  return <StatusBadge tone={tone[s]}>{NOTIFY_STATUS_LABEL[s]}</StatusBadge>;
}

const dateTime = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** "04 Oct 2026, 3:42 pm" in the viewer's time zone (log timestamps are instants, not calendar dates). */
export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTime.format(d);
}
