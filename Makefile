# Sage — common tasks. Everything here is a thin wrapper; see scripts/ and docs/.
.DEFAULT_GOAL := help

.PHONY: help bootstrap dev db-up db-down seed test lint fmt eval deploy

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

bootstrap: ## One-time setup (uv sync, pnpm install, start db)
	./scripts/bootstrap.sh

dev: ## Run API + web app locally
	./scripts/dev.sh

db-up: ## Start local Postgres
	docker compose up -d db

db-down: ## Stop local Postgres
	docker compose down

seed: ## Generate dataset, load warehouse, run detectors
	./scripts/seed-demo.sh

test: ## Run all tests
	uv run pytest
	pnpm --filter web test

lint: ## Lint everything
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy
	pnpm --filter web lint

fmt: ## Format
	uv run ruff format .

eval: ## Run the agent eval harness (the headline number)
	uv run sage-evals

deploy: ## Redeploy the Lightsail instance (git pull + compose up --build)
	bash infra/provision.sh restart

compose-config: ## Validate the full production compose stack
	docker compose -f docker-compose.yml -f infra/docker-compose.prod.yml config -q && echo OK
