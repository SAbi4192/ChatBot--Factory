import { useEffect, useRef } from 'react';

/**
 * GlobalEmbers — the foundry air, on every route.
 *
 * Perf notes (v2): the old version re-ran a full canvas shadowBlur fill on
 * every particle, every frame, at 2x DPR — that alone ate a laptop GPU. Now:
 *  - glow sprites are pre-rendered once per theme (no per-frame shadows),
 *  - the loop is capped at ~30fps and pauses when the tab is hidden,
 *  - DPR is capped at 1.5,
 *  - prefers-reduced-motion users never run the animation at all.
 */

const SPRITE = 64;
const FRAME = 1000 / 30;
const HUES = 10;

type P = { x: number; y: number; r: number; s: number; d: number; a: number; hue: number; flick: number };

function makeSprites(hueOf: (i: number) => number, sat: number, lgt: number): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < HUES; i += 1) {
    const c = document.createElement('canvas');
    c.width = SPRITE;
    c.height = SPRITE;
    const g = c.getContext('2d')!;
    const hue = hueOf(i);
    const grad = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
    grad.addColorStop(0, `hsla(${hue}, ${sat}%, ${Math.min(96, lgt + 26)}%, 1)`);
    grad.addColorStop(0.3, `hsla(${hue}, ${sat}%, ${lgt}%, 0.5)`);
    grad.addColorStop(1, `hsla(${hue}, ${sat}%, ${lgt}%, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE, SPRITE);
    out.push(c);
  }
  return out;
}

export default function GlobalEmbers() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    let parts: P[] = [];
    let light = document.documentElement.getAttribute('data-theme') === 'light';

    const spritesDark = makeSprites((i) => 30 + (i / (HUES - 1)) * 16, 84, 62);
    const spritesLight = makeSprites((i) => 342 + (i / (HUES - 1)) * 6.4, 93, 58);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(74, Math.floor(w / 15));
      light = document.documentElement.getAttribute('data-theme') === 'light';
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: light ? Math.pow(Math.random(), 1.6) * h : Math.random() * h,
        r: 0.8 + Math.random() * 2.3,
        s: 0.12 + Math.random() * 0.4,
        d: (Math.random() - 0.5) * 0.3,
        a: 0.12 + Math.random() * 0.42,
        hue: Math.random(),
        flick: Math.random() * Math.PI * 2,
      }));
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      if (dt < FRAME) return;
      last = now - (dt % FRAME);
      const k = Math.min(3, dt / 16.7);

      ctx.clearRect(0, 0, w, h);
      const sprites = light ? spritesLight : spritesDark;
      for (const p of parts) {
        if (light) {
          p.y += p.s * 1.15 * k;
          if (p.y > h + 12) { p.y = -10; p.x = Math.random() * w; }
        } else {
          p.y -= p.s * k;
          if (p.y < -12) { p.y = h + 10; p.x = Math.random() * w; }
        }
        p.x += (p.d + Math.sin(p.y * 0.012 + p.flick) * 0.22) * k;
        p.flick += 0.06 * k;

        const fade = light
          ? Math.max(0.25, Math.min(1, 1 - p.y / (h * 0.97)))
          : Math.max(0, Math.min(1, p.y / (h * 0.85)));
        const vis = light ? 2.6 : 3.9;
        const alpha = Math.min(1, p.a * vis) * fade * (0.72 + Math.sin(p.flick) * 0.28);
        if (alpha <= 0.01) continue;

        const size = p.r * (light ? 1.55 : 1) * 9;
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[Math.floor(p.hue * (HUES - 1))], p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };

    const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    const onVisibility = () => (document.hidden ? stop() : start());
    const mo = new MutationObserver(() => {
      light = document.documentElement.getAttribute('data-theme') === 'light';
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    start();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      stop();
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} className="global-embers" aria-hidden="true" />;
}
