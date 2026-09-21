import type { FutureSport, Sport, SportEntry } from "@/types/sport";

// Single source of truth for every sport, present and future. Promoting a
// future sport is additive: move its entry here, flip `status`, and fill in
// the remaining `Sport` fields — no separate object shape to rewrite into.
const isDev = process.env.NODE_ENV !== "production";
// Separate sport apps; override per deployment via env (see .env.example).
const cricketUrl = process.env.NEXT_PUBLIC_CRICKET_URL || (isDev ? "http://localhost:5173" : "https://lordofcricket.com");
const karateUrl = process.env.NEXT_PUBLIC_KARATE_URL || (isDev ? "http://localhost:3001" : "");

const sportEntries: SportEntry[] = [
  {
    name: "Cricket",
    slug: "cricket",
    tagline: "The world's game.",
    description: "Step into the world of LordOfCricket.",
    status: "active",
    href: cricketUrl,
    external: true,
    accent: "#E9B949",
    accentSoft: "rgba(233, 185, 73, 0.12)",
    cta: "EXPLORE CRICKET",
  },
  {
    name: "Karate",
    slug: "karate",
    tagline: "Discipline. Power. Precision.",
    description: "A dedicated space for fighters, coaches and competitions.",
    status: karateUrl ? "active" : "coming-soon",
    href: karateUrl || "/karate",
    external: Boolean(karateUrl),
    accent: "#E5484D",
    accentSoft: "rgba(229, 72, 77, 0.12)",
    cta: "EXPLORE KARATE",
    comingSoonHeadline: "Your next arena is coming.",
  },
  {
    name: "Lawn Tennis",
    slug: "lawn-tennis",
    tagline: "The game, refined.",
    description: "Discover players, courts and competition built around the rally.",
    status: "coming-soon",
    href: "/lawn-tennis",
    accent: "#7FA8D6",
    accentSoft: "rgba(127, 168, 214, 0.12)",
    cta: "EXPLORE TENNIS",
    comingSoonHeadline: "Your next rally is coming.",
  },
  { name: "Football", slug: "football", status: "future" },
  { name: "Badminton", slug: "badminton", status: "future" },
  { name: "Tennis", slug: "tennis", status: "future" },
  { name: "Basketball", slug: "basketball", status: "future" },
  { name: "Boxing", slug: "boxing", status: "future" },
  { name: "Swimming", slug: "swimming", status: "future" },
];

export const sports: Sport[] = sportEntries.filter(
  (entry): entry is Sport => entry.status !== "future",
);

export const futureSports: FutureSport[] = sportEntries.filter(
  (entry): entry is FutureSport => entry.status === "future",
);

export function getSportBySlug(slug: string): Sport | undefined {
  return sports.find((sport) => sport.slug === slug);
}

/** Sports that get a page inside this app (excludes off-site sports like Cricket). */
export function getInternalSports(): Sport[] {
  return sports.filter((sport) => !sport.external);
}
