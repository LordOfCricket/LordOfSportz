import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared branded shell for /login and /register — one visual identity, not a generic SaaS template. */
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-tight text-white">Karate Platform</span>
        </Link>

        <Card className="border-white/10 bg-surface-raised">
          <CardContent className="p-6">
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
            <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </CardContent>
        </Card>

        {footer && <div className="mt-6 text-center text-sm text-white/60">{footer}</div>}
      </div>
    </div>
  );
}
