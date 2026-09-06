// Faint hand-drawn botanical line-art, meant to sit at the edges of a
// section (like the leaf sketches in editorial "explore nature" style
// hero templates) — never a full illustration, just a quiet accent.
// Pure line art via `currentColor` + low opacity, so it always blends with
// whatever section color it's dropped into; `aria-hidden` + pointer-events
// none since it's decoration only, never content.
//
// IMPORTANT when placing this: give it a small POSITIVE z-index (e.g.
// `z-[1]`), never a negative one. In sections that mix `overflow-hidden`
// with framer-motion siblings (which add their own `transform`, forcing
// new stacking contexts), a `-z-10` decoration silently stops painting
// entirely in Chromium — not just "behind everything", genuinely
// invisible even at full opacity. `z-[1]` keeps it under normal z-10
// foreground content while actually rendering. Confirmed by hand; don't
// re-introduce a negative z-index here without re-testing in a real
// browser, not just by eyeballing the JSX.
export function SideLeaves({
  className = "",
  flip = false,
}: {
  className?: string;
  flip?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 160 420"
      className={`pointer-events-none select-none ${className}`}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
      fill="none"
    >
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* main branch */}
        <path d="M96 410 C 78 340, 108 290, 84 220 C 62 156, 100 96, 78 20" />
        {/* leaves, alternating along the branch */}
        <path d="M84 220 C 110 208, 132 220, 138 244 C 112 250, 88 244, 84 220Z" />
        <path d="M84 220 C 60 214, 40 228, 34 252 C 60 256, 82 246, 84 220Z" />
        <path d="M92 300 C 118 290, 140 302, 146 326 C 120 332, 96 324, 92 300Z" />
        <path d="M92 300 C 66 294, 46 306, 40 330 C 66 336, 88 328, 92 300Z" />
        <path d="M78 120 C 104 110, 126 122, 132 146 C 106 152, 82 144, 78 120Z" />
        <path d="M78 120 C 52 114, 32 126, 26 150 C 52 156, 74 148, 78 120Z" />
        <path d="M78 20 C 96 8, 116 12, 124 30 C 104 38, 84 34, 78 20Z" />
        {/* a few scattered dots, like seed pods */}
        <circle cx="112" cy="380" r="2.2" />
        <circle cx="54" cy="180" r="2.2" />
        <circle cx="118" cy="70" r="2.2" />
      </g>
    </svg>
  );
}
