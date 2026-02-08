.PHONY: help install dev build up down logs clean test

help:
	@echo "auto-diagram - Docker and development commands"
	@echo ""
	@echo "Development:"
	@echo "  make install      - Install Python dependencies"
	@echo "  make dev          - Run development server with auto-reload"
	@echo ""
	@echo "Docker:"
	@echo "  make build        - Build Docker image"
	@echo "  make up           - Start containers (development)"
	@echo "  make up-prod      - Start containers (production with nginx)"
	@echo "  make down         - Stop and remove containers"
	@echo "  make logs         - Show container logs"
	@echo "  make logs-prod    - Show production container logs"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean        - Remove build artifacts and cache"
	@echo "  make health       - Check health endpoints"
	@echo ""

install:
	pip install -r requirements.txt

dev:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

build:
	docker build -t auto-diagram:latest .

up:
	docker-compose up -d

up-prod:
	docker-compose -f docker-compose.prod.yml up -d

down:
	docker-compose down

down-prod:
	docker-compose -f docker-compose.prod.yml down

logs:
	docker-compose logs -f auto-diagram

logs-prod:
	docker-compose -f docker-compose.prod.yml logs -f

health:
	@echo "Development server health:"
	@curl -s http://localhost:8000/health | jq . || echo "❌ Connection failed"
	@echo ""
	@echo "Production nginx:"
	@curl -s http://localhost/health | jq . 2>/dev/null && echo "✅ Nginx healthy" || echo "❌ Nginx connection failed"

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	rm -rf build/ dist/ *.egg-info .pytest_cache .coverage htmlcov/

shell:
	docker-compose exec auto-diagram sh

shell-prod:
	docker-compose -f docker-compose.prod.yml exec app sh

test-render:
	@echo "Testing diagram render..."
	@curl -X POST -H "Content-Type: application/json" \
		--data @sample/example1.json \
		http://localhost:8000/render \
		--output /tmp/test-output.png && \
		echo "✅ Render successful: /tmp/test-output.png" || \
		echo "❌ Render failed"
