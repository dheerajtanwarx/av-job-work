import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-indigo text-white hover:bg-indigo-600 shadow-[inset_0_-2px_0_rgba(0,0,0,0.15)]",
  accent: "bg-marigold text-ink hover:brightness-95 shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]",
  secondary: "bg-card text-ink border border-line-strong hover:bg-paper-2",
  ghost: "text-ink-2 hover:bg-paper-2",
  danger: "bg-madder text-white hover:brightness-95",
  "danger-ghost": "text-madder hover:bg-madder-50",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-[0.95rem] gap-2",
  lg: "h-12 px-5 text-base gap-2",
  icon: "h-9 w-9",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", asChild, loading, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-[background,filter,box-shadow] select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.1em] [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
          {children}
        </>
      )}
    </Comp>
  );
});
