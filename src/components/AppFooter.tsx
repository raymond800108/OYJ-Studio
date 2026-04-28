import { BUSINESS } from "@/lib/business";

/**
 * Subtle "powered by convra." footer with basic business info.
 * Same wordmark style as invoice email — pure CSS, no image dependency.
 * Low contrast on purpose: visible to anyone looking, never demanding.
 */
export default function AppFooter() {
  const { brand } = BUSINESS;

  return (
    <footer className="w-full mt-8 px-6 py-6 border-t border-stone-200/60">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center sm:items-end justify-between gap-3 text-stone-400/80">
        {/* Wordmark + tagline */}
        <a
          href="https://convra.net"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-baseline gap-2 transition-colors hover:text-stone-600"
          aria-label="convra"
        >
          <span className="text-[9px] tracking-[0.2em] uppercase">Powered by</span>
          <span
            className="font-light text-[18px] leading-none"
            style={{ letterSpacing: "0.02em", color: brand.primary }}
          >
            convra<span style={{ color: brand.accent }}>.</span>
          </span>
        </a>

        {/* Business meta */}
        <div className="flex flex-col items-center sm:items-end gap-0.5 text-[10px] leading-relaxed">
          <div className="tracking-wide">
            <span className="text-stone-500">{BUSINESS.legalName}</span>
            <span className="mx-1.5 text-stone-300">·</span>
            <span>Based in Germany</span>
          </div>
          <div className="tracking-wide">
            {BUSINESS.addressLines.join(", ")}
          </div>
          <div className="tracking-wide font-mono text-[9px]">
            <a
              href={`mailto:${BUSINESS.email}`}
              className="hover:text-stone-600 transition-colors"
            >
              {BUSINESS.email}
            </a>
            <span className="mx-1.5 text-stone-300">·</span>
            <a
              href={`tel:${BUSINESS.phone.replace(/\s/g, "")}`}
              className="hover:text-stone-600 transition-colors"
            >
              {BUSINESS.phone}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
