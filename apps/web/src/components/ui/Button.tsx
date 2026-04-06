// apps/web/src/components/ui/Button.tsx

import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "xs" | "sm" | "md";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium " +
    "focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 focus:ring-offset-white " +
    "disabled:opacity-50 disabled:pointer-events-none " +
    "transition-all duration-150 select-none whitespace-nowrap";

  const sizes: Record<ButtonSize, string> = {
    xs: "h-8 px-2.5 text-xs",
    sm: "h-9 px-3 text-xs",
    md: "h-10 px-4 text-sm",
  };

  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:bg-slate-900",

    secondary:
      "border border-slate-200 bg-white text-slate-900 shadow-sm " +
      "hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100",

    danger:
      "bg-red-600 text-white shadow-sm hover:bg-red-500 active:bg-red-600",

    ghost:
      "bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200",
  };

  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cx(base, sizes[size], variants[variant], className)}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}