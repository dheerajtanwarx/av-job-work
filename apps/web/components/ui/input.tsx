import { CircleAlert } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-fg shadow-xs placeholder:text-fg-faint transition-[border-color,box-shadow] duration-100 hover:border-fg-faint/60 focus:border-accent focus:ring-[3px] focus:ring-accent/15 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(field, "h-8 pointer-coarse:h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(field, "min-h-20 py-1.5 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return (
    <span className={cn("relative inline-flex w-full", className)}>
      <select ref={ref} className={cn(field, "h-8 cursor-pointer appearance-none pr-7 pointer-coarse:h-10")} {...props} />
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-fg-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
      </svg>
    </span>
  );
});

/** Rupee amount input: shows ₹ prefix, value in rupees as string. */
export const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function MoneyInput({ className, ...props }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-fg-faint">₹</span>
      <input ref={ref} type="number" inputMode="decimal" min={0} step="0.01" className={cn(field, "num h-8 pl-6 pointer-coarse:h-10", className)} {...props} />
    </div>
  );
});

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] leading-4 font-medium text-fg-2">
        {label}
        {required && (
          <span className="ml-0.5 text-fg-faint" aria-hidden>
            *
          </span>
        )}
      </span>
      {children}
      {error ? (
        <span role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-danger">
          <CircleAlert className="size-3 shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-fg-muted">{hint}</span>
      ) : null}
    </label>
  );
}
