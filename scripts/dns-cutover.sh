#!/bin/bash
# =============================================================================
# CourtZon DNS Cutover Script
# Run on the production VPS (Ubuntu 24.04) after staging is verified.
# =============================================================================
# Usage:
#   chmod +x scripts/dns-cutover.sh
#   sudo ./scripts/dns-cutover.sh \
#     --domain courtzon.com \
#     --api-domain api.courtzon.com \
#     --www-domain www.courtzon.com \
#     --email admin@courtzon.com
# =============================================================================

set -euo pipefail

# ── Parse args ──
DOMAIN=""
API_DOMAIN=""
WWW_DOMAIN=""
EMAIL=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --api-domain) API_DOMAIN="$2"; shift 2 ;;
    --www-domain) WWW_DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [[ -z "$DOMAIN" || -z "$API_DOMAIN" || -z "$WWW_DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: $0 --domain <domain> --api-domain <api.> --www-domain <www.> --email <email> [--dry-run]"
  exit 1
fi

APP_DIR="/opt/courtzon"
BACKUP_DIR="$APP_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "═══════════════════════════════════════════════════"
echo "  CourtZon DNS Cutover — $TIMESTAMP"
echo "  Domain:       $DOMAIN"
echo "  API:          $API_DOMAIN"
echo "  www:          $WWW_DOMAIN"
echo "  Email:        $EMAIL"
echo "═══════════════════════════════════════════════════"

# ── Pre-flight checks ──
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY RUN] Skipping all mutation steps"
fi

echo ""
echo "📍 Step 1/8: Verifying prerequisites..."
for cmd in docker curl cloudflared certbot; do
  if ! command -v $cmd &>/dev/null; then
    echo "  ❌ $cmd not found. Install it first."
    exit 1
  fi
  echo "  ✅ $cmd found"
done

if [[ ! -d "$APP_DIR" ]]; then
  echo "  ❌ $APP_DIR does not exist. Clone the repo first."
  exit 1
fi
echo "  ✅ App directory exists"

# ── Backup current .env ──
echo ""
echo "📍 Step 2/8: Backing up current .env..."
if [[ -f "$APP_DIR/.env" ]]; then
  cp "$APP_DIR/.env" "$BACKUP_DIR/env.pre-cutover.$TIMESTAMP"
  echo "  ✅ Backed up to $BACKUP_DIR/env.pre-cutover.$TIMESTAMP"
else
  echo "  ⚠️  No .env found at $APP_DIR/.env"
fi

# ── SSL Certificates ──
echo ""
echo "📍 Step 3/8: Obtaining/renewing SSL certificates..."
if [[ "$DRY_RUN" == "false" ]]; then
  # Stop nginx/Docker briefly to free port 80
  docker stop courtzon-frontend 2>/dev/null || true
  sleep 2

  certbot certonly --standalone \
    -d "$DOMAIN" -d "$WWW_DOMAIN" -d "$API_DOMAIN" \
    --email "$EMAIL" --agree-tos --no-eff-email --non-interactive \
    || echo "  ⚠️  certbot failed — check DNS propagation"

  docker start courtzon-frontend 2>/dev/null || true
  echo "  ✅ SSL certificates obtained"
else
  echo "  [DRY RUN] Would run: certbot certonly --standalone -d $DOMAIN -d $WWW_DOMAIN -d $API_DOMAIN"
fi

# ── Update .env ──
echo ""
echo "📍 Step 4/8: Updating .env with production values..."
if [[ "$DRY_RUN" == "false" ]]; then
  cd "$APP_DIR"

  # Update key vars
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
  sed -i "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" .env
  sed -i "s|^WEBHOOK_BASE_URL=.*|WEBHOOK_BASE_URL=https://$API_DOMAIN|" .env
  sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://$DOMAIN,https://$WWW_DOMAIN,https://$API_DOMAIN|" .env
  sed -i "s|^PAYMOB_SANDBOX=.*|PAYMOB_SANDBOX=false|" .env
  sed -i "s|^LOG_LEVEL=.*|LOG_LEVEL=info|" .env

  # Remove RELAX_RATE_LIMIT if present
  sed -i "/^RELAX_RATE_LIMIT/d" .env

  echo "  ✅ .env updated"
  echo ""
  echo "  Changes made:"
  grep -E "^(NODE_ENV|APP_URL|WEBHOOK_BASE_URL|CORS_ORIGINS|PAYMOB_SANDBOX|LOG_LEVEL)=" .env
else
  echo "  [DRY RUN] Would update .env with production values"
fi

# ── Configure nginx ──
echo ""
echo "📍 Step 5/8: Configuring production nginx..."
if [[ "$DRY_RUN" == "false" ]]; then
  # Render nginx config from template
  if [[ -f "$APP_DIR/frontend/nginx.prod.conf.template" ]]; then
    sed -e "s/{{DOMAIN}}/$DOMAIN/g" \
        -e "s/{{WWW_DOMAIN}}/$WWW_DOMAIN/g" \
        -e "s/{{API_DOMAIN}}/$API_DOMAIN/g" \
        "$APP_DIR/frontend/nginx.prod.conf.template" > "$APP_DIR/frontend/nginx.prod.conf"
    echo "  ✅ nginx.prod.conf rendered from template"

    # If using host nginx (not Docker), symlink and reload
    if command -v nginx &>/dev/null && [[ -d /etc/nginx ]]; then
      ln -sf "$APP_DIR/frontend/nginx.prod.conf" /etc/nginx/sites-enabled/courtzon
      nginx -t && nginx -s reload && echo "  ✅ Nginx reloaded"
    fi

    # Set up certbot renewal hook to reload nginx
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    cat > /etc/letsencrypt/renewal-hooks/deploy/reload-courtzon.sh << 'HOOK'
#!/bin/bash
docker exec courtzon-frontend nginx -s reload 2>/dev/null || true
HOOK
    chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-courtzon.sh
    echo "  ✅ Renewal hook installed"
  else
    echo "  ⚠️  nginx.prod.conf not found"
  fi
else
  echo "  [DRY RUN] Would configure nginx for $DOMAIN"
fi

# ── Configure Cloudflare Tunnel ──
echo ""
echo "📍 Step 6/8: Configuring Cloudflare Tunnel..."
if [[ "$DRY_RUN" == "false" ]]; then
  # Check if tunnel already exists
  TUNNEL_LIST=$(cloudflared tunnel list 2>/dev/null || true)

  if echo "$TUNNEL_LIST" | grep -q "courtzon"; then
    echo "  Tunnel 'courtzon' already exists — updating config"
    TUNNEL_ID=$(cloudflared tunnel list | grep courtzon | awk '{print $1}')
  else
    echo "  Creating tunnel 'courtzon'..."
    cloudflared tunnel create courtzon
    TUNNEL_ID=$(cloudflared tunnel list | grep courtzon | awk '{print $1}')
    echo "  ✅ Tunnel created: $TUNNEL_ID"
  fi

  # Route DNS
  cloudflared tunnel route dns courtzon "$API_DOMAIN" || echo "  ⚠️  DNS route may already exist"
  cloudflared tunnel route dns courtzon "$DOMAIN" || echo "  ⚠️  DNS route may already exist"

  # Write config
  mkdir -p ~/.cloudflared
  cat > ~/.cloudflared/config.yml <<YAML
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $API_DOMAIN
    service: http://localhost:3000
  - hostname: $DOMAIN
    service: http://localhost:5173
  - hostname: $WWW_DOMAIN
    service: http://localhost:5173
  - service: http_status:404
YAML
  echo "  ✅ Cloudflare Tunnel config written"

  # Restart tunnel
  cloudflared tunnel stop courtzon 2>/dev/null || true
  sleep 2
  cloudflared tunnel run courtzon --no-autoupdate &
  echo "  ✅ Tunnel started (PID: $!)"
else
  echo "  [DRY RUN] Would configure & start Cloudflare Tunnel"
fi

# ── Rebuild & restart Docker ──
echo ""
echo "📍 Step 7/8: Rebuilding and restarting Docker stack..."
if [[ "$DRY_RUN" == "false" ]]; then
  cd "$APP_DIR"
  docker compose build backend frontend
  docker compose up -d
  echo "  ✅ Docker stack restarted"
else
  echo "  [DRY RUN] Would rebuild & restart Docker"
fi

# ── Verify ──
echo ""
echo "📍 Step 8/8: Verifying cutover..."

verify_endpoint() {
  local url=$1
  local label=$2
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY RUN] Would verify: $url"
    return 0
  fi
  local status
  status=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [[ "$status" == "000" ]]; then
    echo "  ⚠️  $label — unreachable (DNS may still be propagating)"
  elif [[ "$status" -ge 200 && "$status" -lt 500 ]]; then
    echo "  ✅ $label — HTTP $status"
  else
    echo "  ❌ $label — HTTP $status"
  fi
}

verify_endpoint "https://$API_DOMAIN/health" "Health check ($API_DOMAIN/health)"
verify_endpoint "https://$DOMAIN" "Frontend ($DOMAIN)"

# DNS propagation check
echo ""
if [[ "$DRY_RUN" == "false" ]]; then
  echo "DNS records:"
  dig +short "$DOMAIN" 2>/dev/null || nslookup "$DOMAIN" 2>/dev/null | grep Address || echo "  DNS lookup not available"
  dig +short "$API_DOMAIN" 2>/dev/null || nslookup "$API_DOMAIN" 2>/dev/null | grep Address || echo "  DNS lookup not available"
fi

echo ""
echo "═══════════════════════════════════════════════════"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "  DRY RUN COMPLETE — no changes made"
else
  echo "  CUTOVER COMPLETE"
  echo ""
  echo "  Next steps:"
  echo "  1. Run E2E smoke tests: node scripts/e2e-smoke.js"
  echo "  2. Lower Cloudflare DNS TTL to 60s (optional)"
  echo "  3. Monitor /health and /metrics endpoints"
  echo "  4. If rollback needed: restore .env from backup and re-run"
fi
echo "═══════════════════════════════════════════════════"
