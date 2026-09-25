import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { clsx } from "../components/ui";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setInView(true), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);
  return [ref, inView] as const;
}

/** Fades and lifts children into place when scrolled into view. */
export function Reveal({ children, delay = 0, className, as: Tag = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "section" | "li" }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.15);
  return (
    <Tag ref={ref as never} className={clsx("reveal", inView && "in", className)} style={{ animationDelay: `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Smoothly animates from the previous value to `target`. */
export function useCountUp(target: number, duration = 900, start = true) {
  const [value, setValue] = useState(start ? 0 : target);
  const from = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!start) return;
    if (reduced) {
      setValue(target);
      from.current = target;
      return;
    }
    const begin = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = begin + (target - begin) * eased;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target, duration, start, reduced]);
  return value;
}

export function CountUp({ value, format, duration, start = true }: { value: number; format: (n: number) => string; duration?: number; start?: boolean }) {
  const v = useCountUp(value, duration, start);
  return <span className="num">{format(v)}</span>;
}

/** 3D tilt that follows the pointer. Returns props to spread on the element. */
export function useTilt(max = 10) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [style, setStyle] = useState<CSSProperties>({});
  return {
    ref,
    style: { ...style, transformStyle: "preserve-3d" as const, transition: "transform 0.25s ease-out" },
    onPointerMove: (e: React.PointerEvent) => {
      if (reduced || e.pointerType !== "mouse" || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      setStyle({ transform: `perspective(1000px) rotateY(${x * max}deg) rotateX(${-y * max}deg)` });
    },
    onPointerLeave: () => setStyle({ transform: "perspective(1000px) rotateY(0) rotateX(0)" }),
  };
}

/** A burst of CSS confetti — no library needed. */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  const colors = ["#2dd4bf", "#a78bfa", "#ff6b4a", "#ffd23f", "#38bdf8"];
  const [bits] = useState(() =>
    Array.from({ length: pieces }, (_, i) => ({
      x: `${(Math.random() - 0.5) * 520}px`,
      y: `${-120 - Math.random() * 260}px`,
      r: `${Math.random() * 720 - 360}deg`,
      c: colors[i % colors.length],
      d: Math.random() * 200,
      w: 6 + Math.random() * 6,
    })),
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 flex justify-center" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute animate-confetti rounded-sm"
          style={{ width: b.w, height: b.w * 0.45, background: b.c, animationDelay: `${b.d}ms`, ["--x" as string]: b.x, ["--y" as string]: b.y, ["--r" as string]: b.r }}
        />
      ))}
    </div>
  );
}
