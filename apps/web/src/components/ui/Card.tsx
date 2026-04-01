// apps/web/src/components/ui/Card.tsx

import React from "react";

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

type Props = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: Props) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-gray-200 bg-white shadow-sm",
        className
      )}
      {...props}
    />
  );
}