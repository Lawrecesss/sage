"""Smoke test: the package imports cleanly (workspace wiring is intact).

Replace with real tests as the package is built out — see docs/team-plan.md.
"""

import importlib


def test_package_imports() -> None:
    assert importlib.import_module("sage_api")
