// apps/web/src/components/ui/Badge.tsx

import React from "react";

type BadgeVariant = "neutral" | "success" | "warning" | "error";
type BadgeSize = "sm" | "md";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  size?: BadgeSize;
};

export function Badge({ variant = "neutral", size = "md", className, ...props }: Props) {
  const variants: Record<BadgeVariant, string> = {
    neutral:
      "bg-slate-100 text-slate-700 border border-slate-200",
    success:
      "bg-emerald-50 text-emerald-700 border border-emerald-200",
    warning:
      "bg-amber-50 text-amber-700 border border-amber-200",
    error:
      "bg-red-50 text-red-700 border border-red-200",
  };

  const sizes: Record<BadgeSize, string> = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2.5 py-1 text-xs",
  };

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full font-medium leading-none",
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    />
  );
}