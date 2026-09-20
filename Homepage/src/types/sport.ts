export type SportStatus = "active" | "coming-soon";

export type Sport = {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  status: SportStatus;
  href: string;
  external?: boolean;
  accent: string;
  accentSoft: string;
  cta: string;
  comingSoonHeadline?: string;
};

export type FutureSport = {
  name: string;
  slug: string;
  status: "future";
};

export type SportEntry = Sport | FutureSport;
