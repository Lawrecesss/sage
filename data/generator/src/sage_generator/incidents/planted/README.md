# Planted incidents

One file per incident (`0001-supplier-sg-textiles-slip.yaml`, ...). Each is the
ground truth a detector/agent must recover. Write these **before** the agents —
they define what success means.

Target mix (~20 across 12 months):
- **Obvious** — large single-metric deviation (returns spike, price error).
- **Subtle** — slow drift (creeping COGS, dead-stock buildup, AR ageing).
- **Cross-domain-only** — invisible from any single source (4–5 of these; the
  hero scenario is one). e.g. supplier delay → stockout → category revenue drop
  → margin erosion from pricier substitute → recoverable cash.

Schema: see `../schema.py`.
