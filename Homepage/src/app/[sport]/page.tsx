import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getInternalSports, getSportBySlug } from "@/data/sports";
import SportComingSoon from "@/components/sports/SportComingSoon";

type SportPageProps = {
  params: Promise<{ sport: string }>;
};

export async function generateStaticParams() {
  return getInternalSports().map((sport) => ({ sport: sport.slug }));
}

export async function generateMetadata({ params }: SportPageProps): Promise<Metadata> {
  const { sport: slug } = await params;
  const sport = getSportBySlug(slug);
  if (!sport || sport.external) return {};

  return {
    title: sport.name,
    description:
      sport.status === "coming-soon" ? `${sport.description} Coming soon.` : sport.description,
  };
}

export default async function SportPage({ params }: SportPageProps) {
  const { sport: slug } = await params;
  const sport = getSportBySlug(slug);

  // External sports (e.g. Cricket) belong off-site, not on an internal page.
  if (!sport || sport.external) notFound();

  return <SportComingSoon sport={sport} />;
}
