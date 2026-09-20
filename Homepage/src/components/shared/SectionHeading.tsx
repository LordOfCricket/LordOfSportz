type SectionHeadingProps = {
  eyebrow?: string;
  heading: string;
  supporting?: string;
  align?: "left" | "center";
  id?: string;
};

export default function SectionHeading({
  eyebrow,
  heading,
  supporting,
  align = "left",
  id,
}: SectionHeadingProps) {
  const alignment = align === "center" ? "items-center text-center mx-auto" : "items-start text-left";

  return (
    <div className={`flex max-w-2xl flex-col gap-4 ${alignment}`}>
      {eyebrow && (
        <span className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
          {eyebrow}
        </span>
      )}
      <h2
        id={id}
        className="font-display text-4xl leading-[0.95] tracking-tight text-paper sm:text-5xl lg:text-6xl"
      >
        {heading}
      </h2>
      {supporting && (
        <p className="text-base leading-relaxed text-muted sm:text-lg">{supporting}</p>
      )}
    </div>
  );
}
