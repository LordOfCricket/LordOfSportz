import Button from "@/components/shared/Button";
import Container from "@/components/shared/Container";

export default function NotFound() {
  return (
    <section className="flex min-h-[calc(100svh-5rem)] items-center justify-center py-24">
      <Container className="flex flex-col items-center gap-6 text-center">
        <span className="font-display text-7xl leading-none tracking-tight text-paper sm:text-8xl">
          404
        </span>
        <p className="max-w-md text-base leading-relaxed text-muted">
          We couldn&apos;t find that page. It may have moved, or that sport hasn&apos;t joined the
          platform yet.
        </p>
        <Button href="/#sports" variant="secondary" size="lg" showArrow={false} className="mt-2">
          Back to Sports
        </Button>
      </Container>
    </section>
  );
}
