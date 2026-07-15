import { useEffect, useRef, useState } from "react";
import type { BrainStreamEvent } from "@/hooks/use-brain-stream";

type Category = "content" | "media" | "messaging" | "insight";

type Palette = Record<Category, string> & {
  core: string;
};

function readPalette(): Palette {
  if (typeof window === "undefined") {
    return {
      content: "oklch(0.546 0.221 262.881)",
      media: "oklch(0.6 0.118 184.704)",
      messaging: "oklch(0.552 0.014 285.938)",
      insight: "oklch(0.828 0.189 84.429)",
      core: "oklch(0.546 0.221 262.881)",
    };
  }
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v ? v : fallback;
  };
  return {
    content: read("--primary", "oklch(0.546 0.221 262.881)"),
    media: read("--chart-2", "oklch(0.6 0.118 184.704)"),
    messaging: read("--muted-foreground", "oklch(0.552 0.014 285.938)"),
    insight: read("--chart-4", "oklch(0.828 0.189 84.429)"),
    core: read("--ring", "oklch(0.546 0.221 262.881)"),
  };
}

function withAlpha(color: string, alphaPct: number): string {
  return `color-mix(in oklab, ${color} ${alphaPct}%, transparent)`;
}

type Node = {
  id: string;
  category: Category;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  pulse: number;
  isCore?: boolean;
};

type Particle = {
  fromX: number;
  fromY: number;
  toId: string;
  t: number;
  color: string;
};

export type NeuralNetworkCanvasProps = {
  weights: { content: number; media: number; messaging: number; insight: number };
  lastEvent: BrainStreamEvent | null;
  className?: string;
};

/**
 * Neural network — themed with system tokens, subtle halos, no dark backdrop.
 */
export function NeuralNetworkCanvas({ weights, lastEvent, className }: NeuralNetworkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [palette, setPalette] = useState<Palette>(() => readPalette());
  const paletteRef = useRef<Palette>(palette);
  paletteRef.current = palette;

  useEffect(() => {
    setPalette(readPalette());
    const target = document.documentElement;
    const obs = new MutationObserver(() => setPalette(readPalette()));
    obs.observe(target, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const cats: Category[] = ["content", "media", "messaging", "insight"];
    const perCat = 14;
    const list: Node[] = [];
    list.push({
      id: "core",
      category: "insight",
      x: 0.5,
      y: 0.5,
      vx: 0,
      vy: 0,
      mass: 14,
      pulse: 0.3,
      isCore: true,
    });
    cats.forEach((cat, ci) => {
      const baseAngle = (ci / cats.length) * Math.PI * 2;
      for (let i = 0; i < perCat; i++) {
        const a = baseAngle + (Math.random() - 0.5) * 1.1;
        const r = 0.18 + Math.random() * 0.28;
        list.push({
          id: `${cat}-${i}`,
          category: cat,
          x: 0.5 + Math.cos(a) * r,
          y: 0.5 + Math.sin(a) * r * 0.65,
          vx: 0,
          vy: 0,
          mass: 2.5 + Math.random() * 2,
          pulse: Math.random() * 0.4,
        });
      }
    });
    nodesRef.current = list;
  }, []);

  useEffect(() => {
    const total = Math.max(1, weights.content + weights.media + weights.messaging + weights.insight);
    for (const n of nodesRef.current) {
      if (n.isCore) continue;
      const share = weights[n.category] / total;
      n.mass = 2.5 + share * 18;
    }
  }, [weights]);

  useEffect(() => {
    if (!lastEvent) return;
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const candidates = nodesRef.current.filter(
      (n) => n.category === lastEvent.category && !n.isCore,
    );
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    if (!target) return;
    const edge = Math.floor(Math.random() * 4);
    let fx = 0;
    let fy = 0;
    if (edge === 0) {
      fx = Math.random() * w;
      fy = 0;
    } else if (edge === 1) {
      fx = w;
      fy = Math.random() * h;
    } else if (edge === 2) {
      fx = Math.random() * w;
      fy = h;
    } else {
      fx = 0;
      fy = Math.random() * h;
    }
    if (particlesRef.current.length < 40) {
      particlesRef.current.push({
        fromX: fx,
        fromY: fy,
        toId: target.id,
        t: 0,
        color: paletteRef.current[lastEvent.category],
      });
    }
    target.pulse = Math.min(1, target.pulse + 0.5);
  }, [lastEvent]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: rect.width, h: rect.height };
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const step = () => {
      if (!running) return;
      const { w, h } = sizeRef.current;
      const p = paletteRef.current;
      if (w && h) {
        ctx.clearRect(0, 0, w, h);

        const nodes = nodesRef.current;
        for (const n of nodes) {
          if (n.isCore) continue;
          n.vx += (Math.random() - 0.5) * 0.02;
          n.vy += (Math.random() - 0.5) * 0.02;
          n.vx *= 0.92;
          n.vy *= 0.92;
          n.x += n.vx * 0.002;
          n.y += n.vy * 0.002;
          n.pulse *= 0.95;
        }

        ctx.lineWidth = 1;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            if (nodes[i].category !== nodes[j].category) continue;
            const dx = (nodes[i].x - nodes[j].x) * w;
            const dy = (nodes[i].y - nodes[j].y) * h;
            const d = Math.hypot(dx, dy);
            if (d < 110) {
              ctx.strokeStyle = withAlpha(p[nodes[i].category], 18);
              ctx.beginPath();
              ctx.moveTo(nodes[i].x * w, nodes[i].y * h);
              ctx.lineTo(nodes[j].x * w, nodes[j].y * h);
              ctx.stroke();
            }
          }
        }

        for (const n of nodes) {
          const cx = n.x * w;
          const cy = n.y * h;
          const r = n.mass + n.pulse * 4;
          const color = n.isCore ? p.core : p[n.category];
          const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.8);
          halo.addColorStop(0, withAlpha(color, 30));
          halo.addColorStop(1, withAlpha(color, 0));
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(2, r * 0.6), 0, Math.PI * 2);
          ctx.fill();
          if (n.isCore) {
            ctx.strokeStyle = withAlpha(color, 55);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        const alive: Particle[] = [];
        for (const part of particlesRef.current) {
          part.t += 1 / 60;
          const target = nodesRef.current.find((n) => n.id === part.toId);
          if (!target || part.t >= 1) continue;
          const tx = target.x * w;
          const ty = target.y * h;
          const mx = (part.fromX + tx) / 2 + (ty - part.fromY) * 0.15;
          const my = (part.fromY + ty) / 2 - (tx - part.fromX) * 0.15;
          const it = 1 - part.t;
          const x = it * it * part.fromX + 2 * it * part.t * mx + part.t * part.t * tx;
          const y = it * it * part.fromY + 2 * it * part.t * my + part.t * part.t * ty;
          ctx.beginPath();
          ctx.fillStyle = part.color;
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
          alive.push(part);
        }
        particlesRef.current = alive;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`relative w-full overflow-hidden rounded-lg border border-border/60 bg-muted/30 ${className ?? ""}`}
      style={{
        height: 460,
        backgroundImage:
          "radial-gradient(ellipse at center, color-mix(in oklab, var(--muted) 70%, transparent), transparent 70%)",
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Legend color={palette.content} label="Conteúdo" />
        <Legend color={palette.media} label="Mídia paga" />
        <Legend color={palette.messaging} label="Mensageria" />
        <Legend color={palette.insight} label="Insights" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full ring-1 ring-border/60"
        style={{ background: color }}
      />
      {label}
    </div>
  );
}