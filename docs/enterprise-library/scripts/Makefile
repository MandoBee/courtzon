.PHONY: validate index ai-export diagrams health all portal knowledge-graph insights impact-dashboard ai-pack governance metrics release intelligence

validate:
	node scripts/validate-docs.cjs

index:
	node scripts/generate-index.cjs

ai-export:
	node scripts/generate-ai-export.cjs

diagrams:
	node scripts/generate-diagrams.cjs

health:
	node scripts/health-report.cjs

knowledge-graph:
	node scripts/generate-knowledge-graph.cjs

insights:
	node scripts/generate-insights.cjs

impact-dashboard:
	node scripts/generate-impact-dashboard.cjs

ai-pack:
	node scripts/generate-ai-pack.cjs

governance:
	node scripts/generate-governance-report.cjs

metrics:
	node scripts/generate-metrics.cjs

release:
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make release VERSION=vX.Y.Z"; \
		exit 1; \
	fi
	node scripts/generate-release-knowledge.cjs $(VERSION)

intelligence: knowledge-graph insights impact-dashboard ai-pack governance metrics
	@echo "\n✅ All intelligence tasks completed successfully.\n"

all: validate index ai-export diagrams health intelligence
	@echo "\n✅ All automation tasks completed successfully.\n"

portal:
	@if command -v mkdocs > /dev/null 2>&1; then \
		echo "Starting MkDocs dev server on http://127.0.0.1:8000..."; \
		mkdocs serve; \
	else \
		echo "MkDocs not found. Install with: pip install mkdocs mkdocs-material"; \
		exit 1; \
	fi
