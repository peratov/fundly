import { useEffect, useRef, useState } from "react";
import { clsx } from "../../../components/ui";

/**
 * The real Fundly app, running in demo mode (web/src/demo/demo.ts), shown in a frame.
 * The iframe renders at a true device size (e.g. 390×844 or 1280×800) and is scaled to
 * fit its container, so it looks exactly like the product on that device.
 */
export function LiveScreen({
  src,
  width,
  height,
  title,
  eager = false,
  interactive = true,
  className,
}: {
  src: string;
  width: number;
  height: number;
  title: string;
  eager?: boolean;
  interactive?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [near, setNear] = useState(eager);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / width));
    ro.observe(el);
    let io: IntersectionObserver | undefined;
    if (!eager) {
      io = new IntersectionObserver(([e]) => e.isIntersecting && (setNear(true), io?.disconnect()), { rootMargin: "400px" });
      io.observe(el);
    }
    return () => (ro.disconnect(), io?.disconnect());
  }, [width, eager]);

  // A new screen fades in once it has painted.
  useEffect(() => setReady(false), [src]);

  return (
    <div ref={box} className={clsx("relative w-full overflow-hidden bg-slate-50", className)} style={{ height: scale ? height * scale : undefined, aspectRatio: scale ? undefined : `${width} / ${height}` }}>
      {!ready && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-white to-slate-100" aria-hidden>
          <div className="m-4 h-5 w-1/3 rounded bg-slate-200" />
          <div className="mx-4 grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-200/70" />
            ))}
          </div>
        </div>
      )}
      {near && scale > 0 && (
        <iframe
          src={src}
          title={title}
          width={width}
          height={height}
          tabIndex={interactive ? 0 : -1}
          onLoad={() => setTimeout(() => setReady(true), 450)}
          className={clsx("absolute top-0 left-0 origin-top-left border-0 transition-opacity duration-500", ready ? "opacity-100" : "opacity-0", !interactive && "pointer-events-none")}
          style={{ width, height, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}
