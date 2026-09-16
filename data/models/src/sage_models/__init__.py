"""sage_models — shared entity shapes. The domain vocabulary every service mirrors.

`data/schemas/` is generated from these classes (`sage-models-export`, see
`export.py`) — edit the shape here, never in the generated JSON Schema.
"""

from __future__ import annotations

from .customer_segment import CustomerSegment
from .sku import Sku
from .supplier import Supplier

__all__ = ["CustomerSegment", "Sku", "Supplier"]
