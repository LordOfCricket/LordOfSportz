"use client";

import { useState } from "react";
import { CreateProfileCard } from "./CreateProfileCard";
import { Input } from "@/components/ui/Input";
import { createAcademyAction } from "@/lib/server/actions";

export function CreateAcademyForm() {
  const [name, setName] = useState("");

  return (
    <CreateProfileCard
      title="Set up your academy"
      description="Create your academy's organization profile to start accepting coaches and players."
      submitLabel="Create academy"
      onSubmit={() => createAcademyAction({ name })}
    >
      <Input label="Academy name" value={name} onChange={(e) => setName(e.target.value)} required />
    </CreateProfileCard>
  );
}
