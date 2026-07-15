import { useEffect, useRef } from "react";
import type { BrainStreamEvent } from "@/hooks/use-brain-stream";

type Category = "content" | "media" | "messaging" | "insight";

const COLORS: Record<Category, string> = {
  content: "#C8FF00",
  media: "#3B82F6",
  messaging: "#F5F5F5",
  insight: "#A855F7",
};

type Node = {
  id: string;
  category: Category;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  pulse: number; // 0..1
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
 * Live neural-network canvas — soft physics, category clusters, particles
 * flowing in from the edge on each new Brain event.
 */
export function NeuralNetworkCanvas({ weights, lastEvent, className }: NeuralNetworkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  // Init nodes once.
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
      mass: 22,
      pulse: 0.4,
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
          mass: 4 + Math.random() * 3,
          pulse: Math.random() * 0.5,
        });
      }
    });
    nodesRef.current = list;
  }, []);

  // React to weights → adjust node mass by category proportion.
  useEffect(() => {
    const total = Math.max(1, weights.content + weights.media + weights.messaging + weights.insight);
    for (const n of nodesRef.current) {
      if (n.isCore) continue;
      const share = weights[n.category] / total;
      n.mass = 3 + share * 40;
    }
  }, [weights]);

  // React to realtime event → spawn particle.
  useEffect(() => {
    if (!lastEvent) return;
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const candidates = nodesRef.current.filter((n) => n.category === lastEvent.category && !n.isCore);
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
    // Cap simultaneous particles.
    if (particlesRef.current.length < 40) {
      particlesRef.current.push({
        fromX: fx,
        fromY: fy,
        toId: target.id,
        t: 0,
        color: COLORS[lastEvent.category],
      });
    }
    target.pulse = Math.min(1, target.pulse + 0.6);
  }, [lastEvent]);

  // Resize observer.
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

  // Animation loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;
    const step = () => {
      if (!running) return;
      const { w, h } = sizeRef.current;
      if (w && h) {
        // Fade previous frame — cheap trailing glow.
        ctx.fillStyle = "rgba(8,8,8,0.35)";
        ctx.fillRect(0, 0, w, h);

        const nodes = nodesRef.current;
        // Soft physics: attraction to base position, mild jitter.
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

        // Faint links between same-category neighbors.
        ctx.lineWidth = 1;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            if (nodes[i].category !== nodes[j].category) continue;
            const dx = (nodes[i].x - nodes[j].x) * w;
            const dy = (nodes[i].y - nodes[j].y) * h;
            const d = Math.hypot(dx, dy);
            if (d < 110) {
              ctx.strokeStyle = `${COLORS[nodes[i].category]}22`;
              ctx.beginPath();
              ctx.moveTo(nodes[i].x * w, nodes[i].y * h);
              ctx.lineTo(nodes[j].x * w, nodes[j].y * h);
              ctx.stroke();
            }
          }
        }

        // Draw nodes.
        for (const n of nodes) {
          const cx = n.x * w;
          const cy = n.y * h;
          const r = n.mass + n.pulse * 6;
          const color = COLORS[n.category];
          ctx.beginPath();
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.5);
          g.addColorStop(0, color);
          g.addColorStop(0.4, `${color}88`);
          g.addColorStop(1, `${color}00`);
          ctx.fillStyle = g;
          ctx.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = n.isCore ? "#F5F5F5" : color;
          ctx.arc(cx, cy, Math.max(2, r * 0.55), 0, Math.PI * 2);
          ctx.fill();
        }

        // Particles.
        const alive: Particle[] = [];
        for (const p of particlesRef.current) {
          p.t += 1 / 60; // ~1s to reach
          const target = nodesRef.current.find((n) => n.id === p.toId);
          if (!target || p.t >= 1) continue;
          const tx = target.x * w;
          const ty = target.y * h;
          const mx = (p.fromX + tx) / 2 + (ty - p.fromY) * 0.15;
          const my = (p.fromY + ty) / 2 - (tx - p.fromX) * 0.15;
          // Quadratic bezier
          const it = 1 - p.t;
          const x = it * it * p.fromX + 2 * it * p.t * mx + p.t * p.t * tx;
          const y = it * it * p.fromY + 2 * it * p.t * my + p.t * p.t * ty;
          ctx.beginPath();
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 12;
          ctx.arc(x, y, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          alive.push(p);
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
      className={`relative w-full overflow-hidden rounded-xl border border-border/40 bg-[#080808] ${className ?? ""}`}
      style={{ height: 480 }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 flex flex-wrap gap-3 text-[10px] uppercase tracking-wider text-white/60">
        <Legend color={COLORS.content} label="Conteúdo" />
        <Legend color={COLORS.media} label="Mídia paga" />
        <Legend color={COLORS.messaging} label="Mensageria" />
        <Legend color={COLORS.insight} label="Insights" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {label}
    </div>
  );
}