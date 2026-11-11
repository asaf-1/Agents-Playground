// The picture on the home page: three coins travelling round a tilted ring
// about a core, drawn as SVG. On the far side of the ring a coin passes behind
// the core, a little smaller and dimmer; on the near side it passes in front.

// React's refs and effect, for the animation loop.
import { useEffect, useRef } from "react";
// A unique id for each gradient.
import { useSvgId } from "./icons";

// The ring the coins travel: its centre, its two radii, and its tilt.
const CX = 180;
const CY = 150;
const RX = 152;
const RY = 52;
const TILT = (-16 * Math.PI) / 180;
// One lap of the ring, in milliseconds.
const LAP_MS = 14_000;
// Where each coin starts on the ring, a third of a lap apart, so there is
// always a coin in front of the core and one behind it.
const STARTS = [-0.35, -0.35 + (2 * Math.PI) / 3, -0.35 + (4 * Math.PI) / 3];
// How small and how faint a coin is at the far side of the ring.
const FAR_SCALE = 0.78;
const FAR_OPACITY = 0.55;

// A point on the tilted ring at an angle, and how near it is: depth runs from
// -1 (the far side, behind the core) to 1 (the near side, in front).
function pointOnRing(angle: number) {
  const x = RX * Math.cos(angle);
  const y = RY * Math.sin(angle);
  return {
    x: CX + x * Math.cos(TILT) - y * Math.sin(TILT),
    y: CY + x * Math.sin(TILT) + y * Math.cos(TILT),
    depth: Math.sin(angle),
  };
}

// The three coins' faces, each drawn about its own centre (0, 0).
function CoinFace({ index, fills }: { index: number; fills: string[] }) {
  // A gold coin with a B.
  if (index === 0) {
    return (
      <>
        <circle r="22" fill={`url(#${fills[0]})`} />
        <circle
          r="16.5"
          fill="none"
          stroke="rgba(10,13,24,0.3)"
          strokeWidth="2"
        />
        <path
          d="M-4.5 -9v18M-4.5 -9h6a4 4 0 0 1 0 8h-6M-4.5 -1h7a4.5 4.5 0 0 1 0 9h-7"
          fill="none"
          stroke="#0a0d18"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    );
  }
  // A blue coin with three bars.
  if (index === 1) {
    return (
      <>
        <circle r="18" fill={`url(#${fills[1]})`} />
        <path
          d="M-8 -5h16M-8 0h16M-8 5h16"
          stroke="#0a0d18"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </>
    );
  }
  // A violet coin with a diamond.
  return (
    <>
      <circle r="13" fill={`url(#${fills[2]})`} />
      <path d="m0 -8 6 8-6 8-6-8z" fill="#0a0d18" fillOpacity="0.55" />
    </>
  );
}

// Decorative, so hidden from screen readers. The coins move with a frame loop
// that writes their positions straight onto the SVG (no React re-render per
// frame), and stand still for anyone whose system asks for reduced motion.
export function HeroArt({ className }: { className?: string }) {
  // One id per gradient, so two pictures on a page never mix them up.
  const glow = useSvgId("glow");
  const ring = useSvgId("ring");
  const core = useSvgId("core");
  const coinA = useSvgId("coin-a");
  const coinB = useSvgId("coin-b");
  const coinC = useSvgId("coin-c");
  const fills = [coinA, coinB, coinC];

  // Each coin is drawn twice, once behind the core and once in front; each
  // frame shows the copy for the side of the ring the coin is on.
  const back = useRef<(SVGGElement | null)[]>([]);
  const front = useRef<(SVGGElement | null)[]>([]);

  // The frame loop: place every coin, then ask for the next frame. With
  // reduced motion, place them once and stop. The loop pauses by itself while
  // the tab is hidden (that is how requestAnimationFrame works).
  useEffect(() => {
    const reduce =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    let frame = 0;

    // Puts each coin where it is at this moment.
    const place = (now: number) => {
      const turned = reduce?.matches ? 0 : (now / LAP_MS) * 2 * Math.PI;
      STARTS.forEach((start, index) => {
        const { x, y, depth } = pointOnRing(start + turned);
        const near = (depth + 1) / 2;
        const scale = FAR_SCALE + (1 - FAR_SCALE) * near;
        const opacity = FAR_OPACITY + (1 - FAR_OPACITY) * near;
        const transform = `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})`;
        for (const [copy, shown] of [
          [back.current[index], depth < 0],
          [front.current[index], depth >= 0],
        ] as const) {
          if (!copy) continue;
          copy.setAttribute("transform", transform);
          copy.setAttribute("opacity", opacity.toFixed(3));
          copy.setAttribute("visibility", shown ? "visible" : "hidden");
        }
      });
      if (!reduce?.matches) {
        frame = requestAnimationFrame(place);
      }
    };

    // Start now, and start or stop again if the setting changes.
    place(performance.now());
    const restart = () => {
      cancelAnimationFrame(frame);
      place(performance.now());
    };
    reduce?.addEventListener("change", restart);
    return () => {
      cancelAnimationFrame(frame);
      reduce?.removeEventListener("change", restart);
    };
  }, []);

  // The near half of the ring, drawn again in front of the core so the ring
  // itself goes round it.
  const nearArc = `M${CX + RX} ${CY} A${RX} ${RY} 0 0 1 ${CX - RX} ${CY}`;

  // The picture, hidden from screen readers.
  return (
    <svg
      className={className}
      viewBox="0 0 360 300"
      aria-hidden="true"
      focusable="false"
      data-testid="hero-art"
    >
      {/* The colours: a glow, the ring, the core and three coins. */}
      <defs>
        <radialGradient id={glow} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#7c3aed" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={ring}
          x1="28"
          y1="98"
          x2="332"
          y2="202"
          gradientUnits="userSpaceOnUse"
        >
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

      {/* The glow and the orbits around the core; the dashed one turns. */}
      <circle cx={CX} cy={CY} r="140" fill={`url(#${glow})`} />
      <circle
        cx={CX}
        cy={CY}
        r="118"
        fill="none"
        stroke="rgba(255,255,255,0.07)"
      />
      <circle
        className="hero-turn"
        cx={CX}
        cy={CY}
        r="84"
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeDasharray="3 7"
      />
      <ellipse
        cx={CX}
        cy={CY}
        rx={RX}
        ry={RY}
        fill="none"
        stroke={`url(#${ring})`}
        strokeOpacity="0.6"
        strokeWidth="1.5"
        transform={`rotate(-16 ${CX} ${CY})`}
      />

      {/* The coins on the far side of the ring, behind the core. */}
      <g data-testid="hero-coins-back">
        {STARTS.map((_, index) => (
          <g
            key={index}
            ref={(element) => {
              back.current[index] = element;
            }}
            data-testid={`hero-coin-back-${index}`}
          >
            <CoinFace index={index} fills={fills} />
          </g>
        ))}
      </g>

      {/* The core: a hexagon with a mark cut into it. It flips all the way
          round on its upright axis, rests, and flips again (the CSS). */}
      <g className="hero-flip" data-testid="hero-core">
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
      </g>

      {/* The near half of the ring, in front of the core. */}
      <path
        d={nearArc}
        fill="none"
        stroke={`url(#${ring})`}
        strokeOpacity="0.6"
        strokeWidth="1.5"
        transform={`rotate(-16 ${CX} ${CY})`}
      />

      {/* The coins on the near side of the ring, in front of the core. */}
      <g data-testid="hero-coins-front">
        {STARTS.map((_, index) => (
          <g
            key={index}
            ref={(element) => {
              front.current[index] = element;
            }}
            data-testid={`hero-coin-front-${index}`}
          >
            <CoinFace index={index} fills={fills} />
          </g>
        ))}
      </g>

      {/* A few small stars that twinkle. */}
      <circle className="hero-twinkle" cx="84" cy="78" r="2" fill="#c4b5fd" />
      <circle
        className="hero-twinkle hero-twinkle-2"
        cx="318"
        cy="186"
        r="1.6"
        fill="#67e8f9"
      />
      <circle
        className="hero-twinkle hero-twinkle-3"
        cx="132"
        cy="252"
        r="1.4"
        fill="#fde68a"
      />
      <circle
        className="hero-twinkle hero-twinkle-2"
        cx="226"
        cy="46"
        r="1.4"
        fill="#f9a8d4"
      />
    </svg>
  );
}
