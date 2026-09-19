"""CLI entrypoint: `sage-simulate generate`."""

from __future__ import annotations

import typer
from sqlalchemy import create_engine

from .config import GeneratorConfig
from .db.writer import seed
from .entities import build_entities
from .facts import Dataset
from .incidents import apply_posthoc, build_default_incidents, build_modifiers
from .simulate import (
    build_bills,
    build_dates,
    build_invoices,
    build_order_lines,
    simulate_inventory,
)

app = typer.Typer()


@app.command()
def generate(
    seed_value: int = typer.Option(42, "--seed", help="RNG seed; same seed -> same dataset."),
    months: int = typer.Option(12, "--months", help="Number of months to simulate."),
    database_url: str | None = typer.Option(
        None, "--database-url", envvar="DATABASE_URL", help="Postgres connection string."
    ),
    tenant: str = typer.Option(
        "demo", "--tenant", envvar="SEED_TENANT", help="Tenant id to (re)provision and seed."
    ),
) -> None:
    """Build a deterministic synthetic dataset and (re)seed it into Postgres."""
    if not database_url:
        raise typer.BadParameter("DATABASE_URL is required (env var or --database-url).")

    config = GeneratorConfig.for_run(seed=seed_value, months=months)
    typer.echo(f"Building entities (seed={config.seed}, months={config.months})...")
    entities = build_entities(config)

    incidents = build_default_incidents(config, entities)
    modifiers = build_modifiers(incidents)

    typer.echo("Simulating sales...")
    order_lines = build_order_lines(config, entities, modifiers)
    typer.echo(f"  {len(order_lines)} order lines")

    typer.echo("Simulating inventory...")
    stock_movements, purchase_orders = simulate_inventory(config, entities, order_lines, modifiers)
    typer.echo(f"  {len(stock_movements)} stock movements, {len(purchase_orders)} purchase orders")

    typer.echo("Building invoices and bills...")
    invoices = build_invoices(config, entities, order_lines)
    bills = build_bills(config, entities, purchase_orders)

    dataset = Dataset(
        dates=build_dates(config),
        order_lines=order_lines,
        stock_movements=stock_movements,
        purchase_orders=purchase_orders,
        invoices=invoices,
        bills=bills,
    )

    typer.echo(f"Applying {len(incidents)} incidents...")
    apply_posthoc(incidents, dataset, entities.sku_by_id, config)

    typer.echo(f"Seeding Postgres (tenant={tenant})...")
    engine = create_engine(database_url)
    seed(engine, dataset, entities, config, tenant_id=tenant)
    typer.echo("Done.")


if __name__ == "__main__":
    app()
