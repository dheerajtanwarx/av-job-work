"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Field, Textarea } from "./input";

/** Confirm a void/cancel. Records are never deleted, so we always ask why. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  loading,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  onConfirm: (reason: string) => void;
  loading?: boolean;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const invalid = reason.trim().length < 3;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason("");
          setTouched(false);
        }
        onOpenChange(o);
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={loading}
            onClick={() => {
              setTouched(true);
              if (!invalid) onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      <Field label="Reason" required error={touched && invalid ? "Add a short reason" : undefined} hint="This is kept in the history.">
        <Textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Entered twice by mistake" />
      </Field>
    </Dialog>
  );
}
