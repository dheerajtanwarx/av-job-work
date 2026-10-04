import type { Metadata } from "next";

/** Public, read-only challan view opened from the QR code. Never indexed; the token never leaks via Referer. */
export const metadata: Metadata = {
  title: "Job Work Challan",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function PublicChallanLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
