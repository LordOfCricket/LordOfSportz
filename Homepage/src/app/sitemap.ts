import type { MetadataRoute } from "next";
import { getInternalSports } from "@/data/sports";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sportsplatform.example.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", ...getInternalSports().map((sport) => sport.href)];

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.6,
  }));
}
