.DEFAULT_GOAL := help
.PHONY: help up down restart build ps logs seed reseed jobs notify monitor-now psql reset

## Core services (db, retail-mcp, openclaw, web, cron-monitor) — the always-on stack
up: ## Start the core services in the background
	docker compose up -d db retail-mcp openclaw web cron-monitor

down: ## Stop all services
	docker compose down

restart: down up ## Restart the core services

build: ## Build (or rebuild) every service image
	docker compose build

ps: ## Show status of running services
	docker compose ps

logs: ## Tail logs for a service, e.g. `make logs s=web`
	docker compose logs -f $(s)

## Data seeding
seed: ## Seed the demo dataset into Postgres (starts db if needed). Optional: tenant=<id>
	docker compose up -d db
	docker compose run --rm -e SEED_TENANT=$(or $(tenant),demo) simulator

reseed: seed ## Alias for `make seed` (the simulator always wipes + regenerates)

## One-off job containers (profiles: ["jobs"])
jobs: ## Run every one-off job container (simulator, notifier, ...)
	docker compose up -d db
	docker compose --profile jobs up simulator notifier

notify: ## Run just the notifier job
	docker compose --profile jobs up notifier

## Cron monitor
monitor-now: ## Run the anomaly-monitor report once, for every active tenant, right now
	docker compose run --rm -e CRON_RUN_ONCE=true cron-monitor

## Misc
psql: ## Open a psql shell into the db service
	docker compose exec db psql -U sage -d sage

reset: ## DANGER: stop everything and wipe volumes (drops all seeded data)
	docker compose down -v

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}'
