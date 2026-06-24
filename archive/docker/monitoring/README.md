# Monitoring Stack

## Quick Start
```bash
# Main stack must be running first (creates the shared `courtzon` network)
docker compose up -d
docker compose -f docker-compose.monitoring.yml up -d
```

## Services
- **Prometheus** (http://localhost:9090) — Metrics collection
- **Grafana** (http://localhost:3001, admin:${GRAFANA_PASSWORD}) — Dashboards
- **Node Exporter** (http://localhost:9100) — System metrics

## Import Dashboard
1. Login to Grafana at http://localhost:3001
2. Go to Dashboards → Import
3. Use dashboard ID: 1860 (Node Exporter Full) or create custom

## Backend Metrics
The backend exposes metrics at `/metrics` endpoint (requires Fastify metrics plugin).
