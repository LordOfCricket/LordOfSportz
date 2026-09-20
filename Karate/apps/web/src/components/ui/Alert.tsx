import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "success" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
};

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  title: string;
}

export function Alert({ className, tone = "info", title, children, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn("rounded-md border p-3 text-sm", TONE_CLASSES[tone], className)}
      {...props}
    >
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-text-secondary">{children}</div>}
    </div>
  );
}
