import { JOB_STATUS_LABEL, PAY_STATUS_LABEL, type JobStatus, type PayStatus } from "@av/shared";
import { Badge, type Tone } from "@/components/ui";

const JOB_TONE: Record<JobStatus, Tone> = { DRAFT: "neutral", IN_PROGRESS: "accent", PARTIALLY_RECEIVED: "warning", COMPLETED: "success", CANCELLED: "danger" };
const PAY_TONE: Record<PayStatus, Tone> = { NOT_PAID: "danger", PARTIAL: "warning", PAID: "success", NOTHING_DUE: "neutral" };

export const JobStatusBadge = ({ status, overdue }: { status: JobStatus; overdue?: boolean }) =>
  overdue && status !== "COMPLETED" && status !== "CANCELLED" ? <Badge look="dot" tone="danger" label="Overdue" /> : <Badge look="dot" tone={JOB_TONE[status]} label={JOB_STATUS_LABEL[status]} />;

export const PayStatusBadge = ({ status }: { status: PayStatus }) => <Badge tone={PAY_TONE[status]} label={PAY_STATUS_LABEL[status]} />;
