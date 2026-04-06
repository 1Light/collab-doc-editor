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
        // base
        "rounded-3xl border bg-white",

        // softer, more modern border + depth
        "border-slate-200/80 shadow-sm shadow-slate-200/60",

        // subtle hover polish (no functional change)
        "transition-shadow hover:shadow-md",

        className
      )}
      {...props}
    />
  );
}