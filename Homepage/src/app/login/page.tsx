import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/shared/Container";
import LoginForm from "@/components/layout/LoginForm";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to your LordOfSportz account.",
};

export default function LoginPage() {
  return (
    <section className="flex min-h-[70svh] items-center py-32">
      <Container className="max-w-xl">
        <span className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">Your sporting identity</span>
        <h1 className="mt-4 font-display text-6xl leading-[0.9] text-paper">WELCOME BACK.</h1>
        <p className="mt-6 max-w-md text-muted">One account for every sport. Sign in once and your profile travels with you.</p>
        <LoginForm />
        <Link href="/" className="mt-8 inline-flex border-b border-accent pb-2 text-sm font-semibold tracking-wide text-paper hover:text-accent">BACK TO HOME</Link>
      </Container>
    </section>
  );
}