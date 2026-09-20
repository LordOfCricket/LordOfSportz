import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink px-4 text-center text-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">403</p>
      <h1 className="text-2xl font-semibold tracking-tight">You don&apos;t have access to this page</h1>
      <p className="max-w-sm text-sm text-white/70">
        Your account doesn&apos;t have the role required for this section of the platform.
      </p>
      <Link href="/login" className="mt-4 text-ink">
        <Button variant="secondary">Back to sign in</Button>
      </Link>
    </div>
  );
}
