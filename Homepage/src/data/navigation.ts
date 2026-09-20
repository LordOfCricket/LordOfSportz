export type NavLink = {
  label: string;
  href: string;
};

export const navLinks: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Sports", href: "/#sports" },
  { label: "Matches", href: "/#matches" },
  { label: "About", href: "/#about" },
  { label: "Shops", href: "/shop" },
];
