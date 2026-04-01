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
    "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white " +
    "disabled:opacity-50 disabled:pointer-events-none " +
    "transition-colors select-none whitespace-nowrap";

  const sizes: Record<ButtonSize, string> = {
    xs: "h-8 px-2.5 text-xs",
    sm: "h-9 px-3 text-xs",
    md: "h-10 px-4 text-sm",
  };

  const variants: Record<ButtonVariant, string> = {
    primary: "bg-gray-900 text-white hover:bg-gray-800 active:bg-gray-900",
    secondary:
      "border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100",
    danger: "bg-red-600 text-white hover:bg-red-500 active:bg-red-600",
    ghost: "bg-transparent text-gray-900 hover:bg-gray-100 active:bg-gray-200",
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