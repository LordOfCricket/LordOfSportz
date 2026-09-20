"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/shared/icons";
import { navLinks } from "@/data/navigation";
import { useAuthUser } from "@/lib/auth";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuthUser();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
        isScrolled || isOpen
          ? "border-b border-line bg-ink/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <a href="#main-content" className="skip-link rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink">
        Skip to content
      </a>
      <nav
        aria-label="Primary"
        className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 py-4 sm:px-8 lg:px-12"
      >
        <Link href="/" className="font-display text-2xl tracking-wide text-paper">
          LORD<span className="text-accent">OF</span>SPORTZ
        </Link>

        <ul className="hidden items-center gap-10 md:flex">
          {navLinks.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                className="nav-link relative py-2 text-sm font-medium tracking-wide text-muted transition-colors hover:text-paper"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {user ? (
          <div className="hidden items-center gap-4 md:flex">
            <span className="max-w-[10rem] truncate text-sm text-muted">{user.name}</span>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold tracking-wide text-paper transition-colors hover:border-accent hover:text-accent"
            >
              Logout
            </button>
          </div>
        ) : (
        <Link
            href="/login"
            className="hidden rounded-full border border-line px-5 py-2.5 text-sm font-semibold tracking-wide text-paper transition-colors hover:border-accent hover:text-accent md:inline-flex"
          >
            Login
          </Link>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls="mobile-menu"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-paper md:hidden"
        >
          {isOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </nav>

      <div
        id="mobile-menu"
        className={`grid overflow-hidden border-b border-line bg-ink/95 backdrop-blur-md transition-all duration-300 md:hidden ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <ul className="flex min-h-0 flex-col gap-2 px-6 py-4">
          {navLinks.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="block rounded-lg px-3 py-3 text-base font-medium text-paper transition-colors hover:bg-ink-2"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li className="mt-1 border-t border-line pt-3">
            {user ? (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  void logout();
                }}
                className="block w-full rounded-lg px-3 py-3 text-left text-base font-semibold text-accent transition-colors hover:bg-ink-2"
              >
                Logout ({user.name})
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setIsOpen(false)}
                className="block rounded-lg px-3 py-3 text-base font-semibold text-accent transition-colors hover:bg-ink-2"
              >
                Login
              </Link>
            )}
          </li>
        </ul>
      </div>
    </header>
  );
}
