"use client";

import { useState } from "react";
import { CreateProfileCard } from "./CreateProfileCard";
import { Input } from "@/components/ui/Input";
import { createScorerProfileAction } from "@/lib/server/actions";

export function ScorerProfileForm() {
  const [displayName, setDisplayName] = useState("");

  return (
    <CreateProfileCard
      title="Complete your scorer profile"
      description="Create your profile to become eligible for tournament officiating assignments."
      onSubmit={() => createScorerProfileAction({ displayName })}
    >
      <Input
        label="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
      />
    </CreateProfileCard>
  );
}
