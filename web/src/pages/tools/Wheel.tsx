import { useRef, useState } from "react";
import { useReducedMotion } from "../../lib/motion";

interface Slice {
  id: string;
  name: string;
  color: string;
}

function randomIndex(n: number) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

/**
 * A fair prize wheel. The winner is chosen with crypto randomness first; the
 * animation then spins so that slice lands under the pointer.
 */
export function Wheel({ slices, onPick, disabled }: { slices: Slice[]; onPick: (id: string) => void; disabled?: boolean }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const pending = useRef<string | null>(null);
  const reduced = useReducedMotion();
  const n = slices.length;
  const slice = 360 / Math.max(1, n);
  const R = 150;

  const spin = () => {
    if (spinning || n === 0) return;
    const idx = randomIndex(n);
    pending.current = slices[idx].id;
    if (reduced || n === 1) {
      onPick(slices[idx].id);
      return;
    }
    const center = (idx + 0.5) * slice;
    const current = ((rotation % 360) + 360) % 360;
    const delta = (((-center - current) % 360) + 360) % 360;
    setSpinning(true);
    setRotation(rotation + 360 * 5 + delta);
    // transitionend doesn't fire in background tabs; make sure the pick always lands.
    window.setTimeout(finish, 4600);
  };

  const finish = () => {
    if (!pending.current) return;
    const id = pending.current;
    pending.current = null;
    setSpinning(false);
    onPick(id);
  };

  const point = (deg: number, r = R) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [R + r * Math.cos(rad), R + r * Math.sin(rad)];
  };

  return (
    <div className="relative mx-auto w-full max-w-[20rem]">
      {/* Pointer */}
      <div className="absolute top-[-6px] left-1/2 z-10 -translate-x-1/2">
        <div className="h-0 w-0 border-x-[14px] border-t-[24px] border-x-transparent border-t-ink-950 drop-shadow-lg dark:border-t-white" />
      </div>
      <div className="rounded-full bg-gradient-to-br from-brand-400 via-grape-500 to-coral-500 p-2 shadow-2xl shadow-grape-500/30">
        <svg
          viewBox={`0 0 ${R * 2} ${R * 2}`}
          className="block w-full rounded-full bg-white"
          style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4.2s cubic-bezier(0.12, 0.8, 0.12, 1)" : "none" }}
          onTransitionEnd={finish}
          role="img"
          aria-label={`Wheel with ${n} names`}
        >
          {n === 1 ? (
            <circle cx={R} cy={R} r={R} fill={slices[0].color} />
          ) : (
            slices.map((s, i) => {
              const [x1, y1] = point(i * slice);
              const [x2, y2] = point((i + 1) * slice);
              const large = slice > 180 ? 1 : 0;
              return <path key={s.id} d={`M${R},${R} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`} fill={s.color} stroke="white" strokeWidth="2" />;
            })
          )}
          {slices.map((s, i) => {
            const mid = (i + 0.5) * slice;
            const [tx, ty] = point(mid, R * 0.62);
            return (
              <text key={s.id} x={tx} y={ty} fill="white" fontSize={n > 12 ? 10 : 13} fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${mid - 90} ${tx} ${ty})`} style={{ fontFamily: "Inter, sans-serif" }}>
                {s.name.length > 12 ? `${s.name.slice(0, 11)}…` : s.name}
              </text>
            );
          })}
          <circle cx={R} cy={R} r="26" fill="white" />
        </svg>
      </div>
      <button
        type="button"
        onClick={spin}
        disabled={disabled || spinning || n === 0}
        className="absolute top-1/2 left-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink-950 font-display text-base font-extrabold text-white shadow-xl ring-4 ring-white transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {spinning ? "…" : "SPIN"}
      </button>
    </div>
  );
}
