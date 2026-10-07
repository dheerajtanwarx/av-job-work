"use client";

import type { WhatsAppSendResult } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";

export interface WhatsAppTarget {
  kind: "return" | "dispatch";
  id: string;
}

const path = (t: WhatsAppTarget) => `/${t.kind === "return" ? "returns" : "dispatches"}/${t.id}/whatsapp`;

/**
 * "WhatsApp" for a return or a material issue: opens the job worker's own WhatsApp chat (wa.me/<number>) with the
 * receipt message and a link to its PDF filled in – you just press Send. When the WhatsApp Business API is set up on
 * the server, the server sends it instead, with the PDF attached.
 */
export function useWhatsAppSend() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const send = async (t: WhatsAppTarget) => {
    if (pending) return;
    // Open the tab now, while we are still inside the click – opened after the request it would be blocked as a pop-up.
    const win = window.open("about:blank", "_blank");
    setPending(t.id);
    try {
      const r = await api.post<WhatsAppSendResult>(path(t));
      if (r.status === "sent") {
        win?.close();
        toast.success(r.message);
      } else if ((r.reason === "not_configured" || r.status === "failed") && r.share.phone) {
        const chat = `https://wa.me/${r.share.phone}?text=${encodeURIComponent(r.share.text)}`;
        if (win) {
          win.opener = null;
          win.location.href = chat;
        } else window.location.href = chat;
        if (r.status === "failed") toast.warning(`WhatsApp Business could not send it (${r.message}). Opened the chat instead.`);
      } else {
        win?.close();
        const fixable = r.reason === "no_phone" || r.reason === "invalid_phone";
        toast.error(r.message, fixable ? { action: { label: "Add number", onClick: () => (window.location.href = `/clients/${r.worker.id}`) } } : undefined);
      }
      qc.invalidateQueries({ queryKey: [t.kind === "return" ? "return" : "job"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e) {
      win?.close();
      toast.error(errorMessage(e));
    } finally {
      setPending(null);
    }
  };

  return { send, pending };
}

export function SendWhatsAppButton({ target, label = "WhatsApp", ...props }: { target: WhatsAppTarget; label?: string } & Omit<ButtonProps, "onClick">) {
  const w = useWhatsAppSend();
  return (
    <Button variant="secondary" {...props} loading={w.pending === target.id} onClick={() => w.send(target)} title="Open the job worker's WhatsApp chat with this receipt">
      <MessageCircle className="text-[#1da851]" /> {label}
    </Button>
  );
}
