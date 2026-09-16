"""Exports every entity in `sage_models` to JSON Schema under `data/schemas/entities/`.

Run via `uv run --project data/models sage-models-export`. The output is
generated — never hand-edit files under `data/schemas/`; edit the pydantic
model here instead and re-run this script.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import CustomerSegment, Sku, Supplier

ENTITIES = {
    "supplier": Supplier,
    "sku": Sku,
    "customer_segment": CustomerSegment,
}


def default_out_dir() -> Path:
    """`data/schemas/entities/`, resolved relative to this file (`data/models/src/sage_models/export.py`)."""
    return Path(__file__).resolve().parents[3] / "schemas" / "entities"


def main() -> None:
    out_dir = default_out_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    for stem, model in ENTITIES.items():
        schema = model.model_json_schema()
        path = out_dir / f"{stem}.schema.json"
        path.write_text(json.dumps(schema, indent=2) + "\n")
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
