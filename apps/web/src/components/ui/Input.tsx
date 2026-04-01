// apps/web/src/components/ui/Input.tsx

import React from "react";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, Props>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cx(
        "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900",
        "placeholder:text-gray-400",
        "shadow-sm",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white",
        "disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
});