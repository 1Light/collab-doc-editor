// apps/web/src/components/ui/IconButton.tsx

import React, { forwardRef } from "react";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

type Size = "sm" | "md";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  label: string;
  size?: Size;
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(
  (
    {
      active = false,
      className,
      label,
      title,
      size = "md",
      type = "button",
      ...props
    },
    ref
  ) => {
    const sizes: Record<Size, string> = {
      sm: "h-8 min-w-8 px-2 text-[12px]",
      md: "h-9 min-w-9 px-2.5 text-[12px]",
    };

    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={title}
        aria-pressed={active}
        data-active={active ? "true" : "false"}
        className={cx(
          "inline-flex items-center justify-center",
          "rounded-md",
          "border border-transparent",
          "transition-colors duration-150",
          "select-none",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white",
          "disabled:opacity-50 disabled:pointer-events-none",
          sizes[size],
          !active && "bg-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900",
          active && "bg-gray-200 text-gray-900 hover:bg-gray-300",
          className
        )}
        {...props}
      />
    );
  }
);

IconButton.displayName = "IconButton";