import { EmptyState } from "@/components/ui/EmptyState";

export function ComingSoon({ feature }: { feature: string }) {
  return (
    <EmptyState
      title={`${feature} is not implemented yet`}
      description="This section is scaffolded as part of the Phase 1 navigation shell. The underlying feature ships in a later phase."
    />
  );
}
