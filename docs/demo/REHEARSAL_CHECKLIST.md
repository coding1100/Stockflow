# Rehearsal Checklist

Run through this 30 minutes before the demo.

## Setup
- [ ] Docker Desktop running.
- [ ] `pnpm install` clean.
- [ ] `pnpm demo:up` → reaches "✅ StockFlow demo is up".
- [ ] Laptop loads http://localhost:3000 and login works (`ops@stockflow.demo` / `demo1234`).
- [ ] Phone on the **same Wi-Fi**; opens `http://<lan-ip>:3000` (printed on startup).

## Reset between runs
- [ ] Re-seed for a clean slate: `pnpm db:seed` (idempotent; deterministic).
- [ ] Refresh both screens.

## Data sanity
- [ ] Dashboard KPIs are populated (not "—").
- [ ] Inventory **Low stock** filter returns ~35 SKUs.
- [ ] Picking queue has overdue (red) + soon (amber) orders.
- [ ] Waves `W-240` / `W-241` exist (hero fallbacks).

## The three peaks
- [ ] Wave **Optimize** draws the route; **show before** toggle shows the "−N% walking" chip.
- [ ] Phone pick: confirm advances; projector dashboard moves within ~2s.
- [ ] **Offline toggle**: picks queue ("N pending sync"); back online flushes with no double counts.
- [ ] Cycle count post moves the **stock-accuracy** KPI on the dashboard.

## Gotchas
- [ ] Phone needs a secure context for PWA install/camera — use the Caddy HTTPS URL (full compose) or
      the http LAN URL for tap-to-confirm (no camera).
- [ ] Pre-grant camera permission if demoing barcode scanning.
- [ ] Conference Wi-Fi blocking LAN peer traffic → fall back to a tunnel (ngrok/cloudflared).
- [ ] Order-drip noise too high? Unset `DEMO_ORDER_DRIP` before `pnpm demo:up`.
