import type { Metadata } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sportsplatform.example.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LordOfSportz | One platform. Every sport.",
    template: "%s | LordOfSportz",
  },
  description:
    "LordOfSportz brings players, matches, leagues and sporting communities into one connected ecosystem.",
  keywords: ["LordOfSportz", "cricket", "karate", "lawn tennis", "football", "sports community"],
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "LordOfSportz",
    title: "LordOfSportz | One platform. Every sport.",
    description:
      "Players, matches, leagues and sporting communities in one connected ecosystem.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LordOfSportz | One platform. Every sport.",
    description:
      "Players, matches, leagues and sporting communities in one connected ecosystem.",
  },
};

export const viewport = {
  themeColor: "#0a0a0b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ink text-paper">
        <noscript>
          <style>{".reveal { opacity: 1 !important; transform: none !important; }"}</style>
        </noscript>
        <Navbar />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
