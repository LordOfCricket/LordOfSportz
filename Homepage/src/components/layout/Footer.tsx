import Link from "next/link";
import { sports } from "@/data/sports";
import { navLinks } from "@/data/navigation";
import { InstagramIcon, TwitterIcon, YoutubeIcon } from "@/components/shared/icons";
import Container from "@/components/shared/Container";

const socialLinks = [
  { label: "Instagram", href: "#", Icon: InstagramIcon },
  { label: "Twitter / X", href: "#", Icon: TwitterIcon },
  { label: "YouTube", href: "#", Icon: YoutubeIcon },
];

export default function Footer() {
  return (
    <footer className="border-t border-line bg-ink">
      <Container className="grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-4 lg:py-24">
        <div className="flex flex-col gap-4 sm:col-span-2 lg:col-span-1">
          <Link href="/" className="font-display text-2xl tracking-wide text-paper">
            LORD<span className="text-accent">OF</span>SPORTZ
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            One platform. Every sport. Discover athletes, communities and competitions across the
            games you love.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold tracking-[0.3em] text-muted uppercase">
            Navigation
          </h3>
          <ul className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="text-sm text-paper/80 transition-colors hover:text-accent"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold tracking-[0.3em] text-muted uppercase">Sports</h3>
          <ul className="flex flex-col gap-3">
            {sports.map((sport) => (
              <li key={sport.slug}>
                {sport.external ? (
                  <a
                    href={sport.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-paper/80 transition-colors hover:text-accent"
                  >
                    {sport.name}
                  </a>
                ) : (
                  <Link
                    href={sport.href}
                    className="text-sm text-paper/80 transition-colors hover:text-accent"
                  >
                    {sport.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-semibold tracking-[0.3em] text-muted uppercase">Social</h3>
          <ul className="flex items-center gap-3">
            {socialLinks.map(({ label, href, Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-paper/80 transition-colors hover:border-accent hover:text-accent"
                >
                  <Icon />
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
            <a href="mailto:hello@lordofsportz.com" className="transition-colors hover:text-accent">Contact</a>
            <a href="#" className="transition-colors hover:text-accent">Privacy</a>
            <a href="#" className="transition-colors hover:text-accent">Terms</a>
          </div>
        </div>
      </Container>

      <div className="border-t border-line-soft py-6">
        <Container className="flex flex-col items-center justify-between gap-2 sm:flex-row">
          <p className="text-xs text-muted">© 2026 LordOfSportz. All rights reserved.</p>
          <p className="text-xs text-muted">One platform. Every sport.</p>
        </Container>
      </div>
    </footer>
  );
}
