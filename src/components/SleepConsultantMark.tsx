// Hand-drawn line-art mark for שולמית בן נעים — יעוץ שינה לתינוק:
// a sleeping, swaddled newborn with a flower crown resting under an
// arch, crescent moon and sparkles. Pure `currentColor` strokes/fills
// so it can be recolored (and it darkens automatically) anywhere it's
// placed — header, hero, footer.
export function SleepConsultantMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="שולמית בן נעים — יעוץ שינה לתינוק"
    >
      <defs>
        <mask id="scm-moon" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="200">
          <rect x="0" y="0" width="240" height="200" fill="white" />
          <circle cx="177" cy="57" r="14" fill="black" />
        </mask>
      </defs>

      {/* arch */}
      <path d="M24,148 A112,86 0 0 1 216,148" />

      {/* crescent moon */}
      <circle cx="170" cy="60" r="18" fill="currentColor" stroke="none" opacity="0.92" mask="url(#scm-moon)" />

      {/* sparkles */}
      <path d="M201,44 q1.5,6 6,6 q-4.5,0 -6,6 q-1.5,-6 -6,-6 q4.5,0 6,-6 z" fill="currentColor" stroke="none" />
      <path d="M144,36 q1,4 4,4 q-3,0 -4,4 q-1,-4 -4,-4 q3,0 4,-4 z" fill="currentColor" stroke="none" />
      <path d="M204,90 q1,4 4,4 q-3,0 -4,4 q-1,-4 -4,-4 q3,0 4,-4 z" fill="currentColor" stroke="none" />

      {/* swaddle / cocoon body */}
      <path d="M58,152 C56,128 66,102 98,95 C132,88 155,106 157,129 C159,150 141,160 113,160 C91,160 60,161 58,152 Z" />

      {/* swaddle fold lines */}
      <path d="M90,103 C98,114 101,130 97,149" strokeWidth={1.6} opacity={0.5} fill="none" />
      <path d="M120,99 C126,112 128,131 122,153" strokeWidth={1.6} opacity={0.5} fill="none" />

      {/* head */}
      <circle cx="66" cy="110" r="17" />
      {/* closed eye */}
      <path d="M60,111 q5,-4 10,0" strokeWidth={1.8} />
      {/* little smile */}
      <path d="M63,118 q3,2 6,0" strokeWidth={1.6} opacity={0.7} />

      {/* flower crown */}
      <g opacity={0.95}>
        <circle cx="47" cy="88" r="6" />
        <circle cx="60" cy="78" r="6.5" />
        <circle cx="74" cy="86" r="5.5" />
        <circle cx="60" cy="83" r="2.4" fill="currentColor" stroke="none" />
      </g>

      {/* little fist near chin */}
      <circle cx="49" cy="126" r="5.5" />

      {/* feet peeking out */}
      <ellipse cx="133" cy="157" rx="8" ry="5.5" transform="rotate(-18 133 157)" />
      <ellipse cx="147" cy="153" rx="8" ry="5.5" transform="rotate(-8 147 153)" />
    </svg>
  );
}
