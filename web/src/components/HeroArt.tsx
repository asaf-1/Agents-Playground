import { useSvgId } from "./icons";

// Decorative orbit of tokens for the home hero. aria-hidden, no text.
export function HeroArt({ className }: { className?: string }) {
  const glow = useSvgId("glow");
  const ring = useSvgId("ring");
  const core = useSvgId("core");
  const coinA = useSvgId("coin-a");
  const coinB = useSvgId("coin-b");
  const coinC = useSvgId("coin-c");

  return (
    <svg
      className={className}
      viewBox="0 0 360 300"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#7c3aed" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient
          id={core}
          x1="130"
          y1="92"
          x2="230"
          y2="208"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={coinA} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fcd34d" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id={coinB} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id={coinC} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f9a8d4" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      <circle cx="180" cy="150" r="140" fill={`url(#${glow})`} />
      <circle
        cx="180"
        cy="150"
        r="118"
        fill="none"
        stroke="rgba(255,255,255,0.07)"
      />
      <circle
        cx="180"
        cy="150"
        r="84"
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeDasharray="3 7"
      />
      <ellipse
        cx="180"
        cy="150"
        rx="152"
        ry="52"
        fill="none"
        stroke={`url(#${ring})`}
        strokeOpacity="0.6"
        strokeWidth="1.5"
        transform="rotate(-16 180 150)"
      />

      <path
        d="M180 92 230.2 121v58L180 208l-50.2-29v-58z"
        fill={`url(#${core})`}
      />
      <path
        d="M180 92 230.2 121v58L180 208l-50.2-29v-58z"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
      />
      <path
        d="M180 120 205 134.5v29L180 178l-25-14.5v-29z"
        fill="none"
        stroke="#0a0d18"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <path
        d="M180 138v22"
        stroke="#0a0d18"
        strokeWidth="7"
        strokeLinecap="round"
      />

      <g className="float-a">
        <circle cx="300" cy="96" r="22" fill={`url(#${coinA})`} />
        <circle
          cx="300"
          cy="96"
          r="16.5"
          fill="none"
          stroke="rgba(10,13,24,0.3)"
          strokeWidth="2"
        />
        <path
          d="M295.5 87v18M295.5 87h6a4 4 0 0 1 0 8h-6M295.5 95h7a4.5 4.5 0 0 1 0 9h-7"
          fill="none"
          stroke="#0a0d18"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g className="float-b">
        <circle cx="66" cy="204" r="18" fill={`url(#${coinB})`} />
        <path
          d="M58 199h16M58 204h16M58 209h16"
          stroke="#0a0d18"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
      <g className="float-c">
        <circle cx="262" cy="236" r="13" fill={`url(#${coinC})`} />
        <path d="m262 228 6 8-6 8-6-8z" fill="#0a0d18" fillOpacity="0.55" />
      </g>

      <circle cx="84" cy="78" r="2" fill="#c4b5fd" />
      <circle cx="318" cy="186" r="1.6" fill="#67e8f9" />
      <circle cx="132" cy="252" r="1.4" fill="#fde68a" />
      <circle cx="226" cy="46" r="1.4" fill="#f9a8d4" />
    </svg>
  );
}
