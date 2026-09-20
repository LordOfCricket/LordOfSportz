import Link from "next/link";
import { ArrowRightIcon } from "@/components/shared/icons";

type ButtonProps = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  showArrow?: boolean;
  className?: string;
};

const base =
  "group inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition-all duration-300 focus-visible:outline-offset-4";

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-paper text-ink hover:bg-accent hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(74,222,128,0.25)]",
  secondary:
    "border border-line text-paper hover:border-paper/60 hover:-translate-y-0.5",
  ghost: "text-paper underline-offset-4 hover:text-accent",
};

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

export default function Button({
  href,
  children,
  variant = "primary",
  size = "md",
  showArrow = true,
  className = "",
}: ButtonProps) {
  const isExternal = href.startsWith("http");
  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`;

  const content = (
    <>
      <span>{children}</span>
      {showArrow && (
        <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
      )}
    </>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}
