"use client";

import { useState } from "react";
import { CreateProfileCard } from "./CreateProfileCard";
import { Input } from "@/components/ui/Input";
import { createCoachProfileAction } from "@/lib/server/actions";

export function CoachProfileForm() {
  const [displayName, setDisplayName] = useState("");

  return (
    <CreateProfileCard
      title="Complete your coach profile"
      description="Create your profile before affiliating with an academy."
      onSubmit={() => createCoachProfileAction({ displayName })}
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
