'use client';

interface Zone {
  code: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
interface Stop {
  seq: number;
  x: number;
  y: number;
  binCode: string;
}
interface RouteLike {
  stops: Stop[];
  totalDistance: number;
}

/**
 * SVG warehouse floor plan. Draws every shelf as a small cell grouped into labelled zones
 * (the fast-pick zones near the pack station are shaded), the pack-station depot, and the
 * planned route as an orthogonal (aisle-following) path with numbered stop badges. The
 * shelves the picker visits are highlighted. `currentSeq` pulses the live position, and the
 * naive path can be overlaid for the before/after comparison.
 *
 * The SVG's aspect ratio is locked to the warehouse's real proportions so it fills the card
 * without large empty bands.
 */
export function WarehouseMap({
  zones,
  bins = [],
  depot,
  route,
  naiveRoute,
  showNaive,
  currentSeq,
}: {
  zones: Zone[];
  bins?: { x: number; y: number }[];
  depot: { x: number; y: number };
  route?: RouteLike | null;
  naiveRoute?: Stop[];
  showNaive?: boolean;
  currentSeq?: number;
}) {
  const pad = 14;
  const contentMaxX = Math.max(...zones.map((z) => z.maxX), ...bins.map((b) => b.x), depot.x, 100);
  const contentMaxY = Math.max(...zones.map((z) => z.maxY), ...bins.map((b) => b.y), depot.y, 60);
  const vbW = contentMaxX + pad * 2;
  const vbH = contentMaxY + pad * 2;

  // Shelves the route visits — highlight these underneath the numbered badges.
  const routeBinKeys = new Set((route?.stops ?? []).map((s) => `${s.x},${s.y}`));

  const orthPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!;
      const cur = pts[i]!;
      d += ` L ${cur.x} ${prev.y} L ${cur.x} ${cur.y}`; // Manhattan: along the aisle, then across
    }
    return d;
  };

  const routePoints = route ? [depot, ...route.stops.map((s) => ({ x: s.x, y: s.y })), depot] : [];
  const naivePoints = naiveRoute ? [depot, ...naiveRoute.map((s) => ({ x: s.x, y: s.y })), depot] : [];

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`}
      className="w-full rounded-lg bg-slate-50"
      style={{ aspectRatio: `${vbW} / ${vbH}`, maxHeight: 480 }}
    >
      {/* Zone backgrounds */}
      {zones.map((z) => (
        <g key={z.code}>
          <rect
            x={z.minX - 5}
            y={z.minY - 5}
            width={z.maxX - z.minX + 10}
            height={z.maxY - z.minY + 10}
            rx={3}
            className={z.code === 'A' || z.code === 'B' ? 'fill-amber-50 stroke-amber-200' : 'fill-white stroke-slate-200'}
            strokeWidth={0.8}
          />
          <text x={(z.minX + z.maxX) / 2} y={z.minY - 8} textAnchor="middle" className="fill-slate-400 text-[6px] font-semibold">
            Zone {z.code}
          </text>
        </g>
      ))}

      {/* Shelves */}
      {bins.map((b, i) => {
        const onRoute = routeBinKeys.has(`${b.x},${b.y}`);
        return (
          <rect
            key={i}
            x={b.x - 2.2}
            y={b.y - 2.2}
            width={4.4}
            height={4.4}
            rx={1}
            className={onRoute ? 'fill-brand-200' : 'fill-slate-200'}
          />
        );
      })}

      {/* Naive (before) route */}
      {showNaive && naivePoints.length > 1 && (
        <path d={orthPath(naivePoints)} fill="none" className="stroke-slate-400" strokeWidth={1.2} strokeDasharray="3 2.5" strokeLinejoin="round" />
      )}

      {/* Planned route */}
      {routePoints.length > 1 && (
        <path d={orthPath(routePoints)} fill="none" className="stroke-brand-500" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      )}

      {/* Pack station / depot */}
      <g>
        <rect x={depot.x - 4} y={depot.y - 4} width={8} height={8} rx={1.5} className="fill-slate-800" />
        <text x={depot.x + 7} y={depot.y + 2} className="fill-slate-600 text-[6px] font-semibold">Pack station</text>
      </g>

      {/* Numbered stops */}
      {route?.stops.map((s) => {
        const active = currentSeq === s.seq;
        return (
          <g key={s.seq}>
            {active && <circle cx={s.x} cy={s.y} r={6.5} className="fill-emerald-400/40 animate-pulse" />}
            <circle cx={s.x} cy={s.y} r={3.6} className={active ? 'fill-emerald-500' : 'fill-brand-600'} stroke="white" strokeWidth={0.6} />
            <text x={s.x} y={s.y + 1.9} textAnchor="middle" className="fill-white text-[4.5px] font-bold">{s.seq}</text>
          </g>
        );
      })}
    </svg>
  );
}
