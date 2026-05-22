# StockFlow — Demo Script (~12–15 min)

Two screens: **laptop/projector** (Dashboard, Inventory, Picking) and a **phone** (picker PWA,
`http://<lan-ip>:3000`). Seed: `demo-default`. Login `ops@stockflow.demo` / `demo1234`.

> Three peaks: **(6) route optimization**, **(7–8) live pick + offline**, **(10) count moves the KPI.**

1. **Dashboard.** Four KPIs populated from 75 days of seeded history; live activity feed ticking
   (order-drip drops ecom orders every ~20s). "Everything the ops lead needs on one screen." Leave it
   on the projector.

2. **Inventory search.** Open *Inventory*. Search a SKU → on-hand / available / bin instantly.
   Click **Velocity A** → note A-items live in zones A/B (near pack). Click **Low stock** → the ~35
   engineered low-stock SKUs surface.

3. **Overselling prevention.** Open a low-availability SKU → *Channel reservation* card. Reserve more
   than available → **blocked: "overselling prevented."** Reserve within available → succeeds and
   available drops. Concrete proof of the accuracy promise.

4. **Picking — order queue.** Open *Picking*. Show the queue: channels, SLA buckets (overdue in red),
   zones touched per order.

5. **Build a wave.** *Suggested waves* proposes a zone-clustered group with a plain-English rationale.
   Click **Accept** (or tick 4–5 orders → **Build wave**).

6. **Optimize + visualize (the wow).** Open the wave → **Optimize route**. The warehouse map draws the
   numbered route; A-zone shaded near pack. Tick **show before** → dashed naive path + **"−N% walking"**
   chip. Pause here.

7. **Release + pick on the phone.** **Release**, then on the phone open the picker (the wave-detail
   *Open picker* button, or `/pick/<id>`). **Start wave** → next-stop-only UI: bin, item, qty. Tap
   **Simulate scan** then **Confirm pick**. On the projector the throughput tile + activity feed move
   within ~2s.

8. **Offline moment.** On the phone tap **● Online → ✈ Offline**. Keep confirming picks — UI stays
   instant, header shows **"N pending sync."** Tap back to **Online** → queue flushes, transactions
   reconcile, no double counts (idempotent on `scanId`).

9. **(Optional) Short pick / batch.** Report a short at a bin → exception raised without breaking flow.
   A batch wave shows multi-tote ("Tote T2").

10. **Cycle count → accuracy moves.** *Cycle Counts* → **New A-tier count** → **Count**. Step through
    bins, enter a counted qty that differs from expected → **Finish & post**. Adjustments flow through
    the event bus and the **Dashboard stock-accuracy KPI updates live**. Closes the loop.

11. **Picker performance.** *Picker Stats* → avg pick time, actual-vs-estimate for the completed wave.
    "Coaching from data, not anecdote."

**Fallback:** two pre-optimized hero waves (`W-240`, `W-241`) exist if live optimization ever stalls.
