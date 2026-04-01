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
    neutral: "bg-gray-100 text-gray-700",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-yellow-100 text-yellow-900",
    error: "bg-red-100 text-red-800",
  };

  const sizes: Record<BadgeSize, string> = {
    sm: "px-2 py-0.5 text-[11px]",
    md: "px-2 py-1 text-xs",
  };

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full font-medium",
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    />
  );
}