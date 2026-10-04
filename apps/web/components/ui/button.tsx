import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-accent-solid text-on-accent shadow-xs hover:bg-accent-solid-hover",
  secondary: "border border-border-strong bg-surface text-fg shadow-xs hover:bg-surface-2",
  ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger-solid text-white shadow-xs hover:brightness-110",
  "danger-ghost": "text-danger hover:bg-danger-subtle",
} as const;

const sizes = {
  sm: "h-7 px-2.5 text-[13px] gap-1.5 [&_svg]:size-3.5",
  md: "h-8 px-3 text-[13px] gap-1.5 [&_svg]:size-3.5 pointer-coarse:h-10",
  lg: "h-9 px-3.5 text-sm gap-2 [&_svg]:size-4 pointer-coarse:h-10",
  icon: "size-8 [&_svg]:size-4 pointer-coarse:size-10",
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
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-[background-color,color,filter,opacity] duration-100 ease-out select-none active:opacity-85 disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <span className="size-3 animate-spin rounded-full border-[1.5px] border-current border-r-transparent" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});
