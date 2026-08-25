// Monochrome, thin-stroke icon set (Lucide-style). One stroke weight, one
// size prop, currentColor throughout — no emoji, no multicolor packs.

type IconProps = { className?: string; strokeWidth?: number };

function Stroke({ d, className, strokeWidth = 1.6 }: IconProps & { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "h-4 w-4"}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/* Brand mark: a four-point star spark on the gradient tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={`brand-tile grid shrink-0 place-items-center rounded-xl
        ${className ?? "h-8 w-8"}`}
    >
      <svg viewBox="0 0 24 24" className="h-[62%] w-[62%]" fill="currentColor" aria-hidden>
        <path d="M12 2.5c.9 4.9 2.3 6.6 7.5 7.7v3.6c-5.2 1.1-6.6 2.8-7.5 7.7h-.1
          c-.9-4.9-2.3-6.6-7.4-7.7v-3.6c5.1-1.1 6.5-2.8 7.4-7.7z" />
        <circle cx="19.5" cy="4.5" r="1.6" />
      </svg>
    </span>
  );
}

const PATHS: Record<string, string> = {
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  bell: "M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6M10.5 19a2 2 0 0 0 3 0",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9",
  code: "M8 8l-4 4 4 4M16 8l4 4-4 4",
  play: "M7 5l12 7-12 7z",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  calendar: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM16 3v4M8 3v4M4 10h16",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM9 8h6M9 12h6",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  wrench: "M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.8 2.8-2.5-2.5z",
  sparkle: "M12 4l1.7 5.3L19 11l-5.3 1.7L12 18l-1.7-5.3L5 11l5.3-1.7z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  terminal: "M4 17l5-5-5-5M11 19h9",
  check: "M5 12l5 5 9-10",
  x: "M6 6l12 12M18 6L6 18",
  shield: "M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z",
  server: "M4 5h16v5H4zM4 14h16v5H4zM7 7.5h.01M7 16.5h.01",
  google: "M12 11v2.5h4.2c-.4 2-2 3.5-4.2 3.5a4.5 4.5 0 1 1 0-9c1.2 0 2.2.4 3 1.1l1.9-1.9A7.5 7.5 0 1 0 12 19.5c4.3 0 7.2-3 7.2-7.3 0-.4 0-.8-.1-1.2z",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, strokeWidth }: IconProps & { name: string }) {
  return (
    <Stroke d={PATHS[name] ?? PATHS.wrench} className={className} strokeWidth={strokeWidth} />
  );
}
