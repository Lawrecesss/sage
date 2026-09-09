"""Deterministic sub-streams for the generator.

Every entity builder and simulator draws from its own named random stream derived
from the one `GeneratorConfig.seed`. Same seed + same labels → same numbers, on
every machine and Python build (unlike the salted builtin `hash()`), so the whole
dataset stays byte-reproducible.

    rng = substream(config.seed, "suppliers")
    rng = substream(config.seed, "catalog", "pricing")
"""

from __future__ import annotations

import hashlib
import random

__all__ = ["substream"]


def substream(seed: int, *labels: str | int) -> random.Random:
    """A `random.Random` seeded from `seed` and an ordered list of labels."""
    digest = hashlib.sha256(str(seed).encode())
    for label in labels:
        digest.update(b"\x1f")  # unit separator — keeps ("a","b") != ("ab",)
        digest.update(str(label).encode())
    return random.Random(int.from_bytes(digest.digest()[:8], "big"))
