import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[0.68rem] font-semibold uppercase tracking-wide whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line bg-panel-2 text-muted",
        info: "border-accent/40 bg-accent/10 text-accent",
        ok: "border-ok/40 bg-ok/10 text-ok",
        warn: "border-warn/40 bg-warn/10 text-warn",
        danger: "border-danger/50 bg-danger/10 text-danger",
        critical: "border-crit/60 bg-crit/20 text-crit",
        control: "border-ctl/50 bg-ctl/10 text-ctl",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
