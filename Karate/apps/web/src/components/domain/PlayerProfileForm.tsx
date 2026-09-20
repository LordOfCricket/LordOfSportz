"use client";

import { useState } from "react";
import { CreateProfileCard } from "./CreateProfileCard";
import { Input } from "@/components/ui/Input";
import { createPlayerProfileAction } from "@/lib/server/actions";

export function PlayerProfileForm() {
  const [displayName, setDisplayName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE">("MALE");

  return (
    <CreateProfileCard
      title="Complete your player profile"
      description="Tell us who you are so academies and coaches can find and identify you."
      onSubmit={() => createPlayerProfileAction({ displayName, dateOfBirth, gender })}
    >
      <Input
        label="Display name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
      />
      <Input
        label="Date of birth"
        type="date"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        required
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="gender" className="text-sm font-medium text-text-primary">
          Gender
        </label>
        <select
          id="gender"
          value={gender}
          onChange={(e) => setGender(e.target.value as "MALE" | "FEMALE")}
          className="h-10 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </select>
      </div>
    </CreateProfileCard>
  );
}
