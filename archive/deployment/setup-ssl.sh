#!/bin/bash
# CourtZon SSL Certificate Setup & Auto-Renewal
# Run on the Hostinger VPS (Ubuntu 24.04)
# 
# Usage:
#   chmod +x scripts/setup-ssl.sh
#   sudo ./scripts/setup-ssl.sh courtzon.com

set -e

DOMAIN=${1:-courtzon.com}
EMAIL=${2:-admin@courtzon.com}

echo "═══════════════════════════════════════════════════"
echo "  CourtZon SSL Setup — $DOMAIN"
echo "═══════════════════════════════════════════════════"

# Install certbot
apt-get update -qq
apt-get install -y -qq certbot python3-certbot-nginx

# Stop nginx temporarily to free port 80
systemctl stop nginx 2>/dev/null || true

# Obtain certificates (standalone mode for first run)
certbot certonly --standalone \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  -d "api.$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --non-interactive

echo "✅ Certificates obtained for $DOMAIN, www.$DOMAIN, api.$DOMAIN"

# Set up auto-renewal (certbot installs a systemd timer automatically)
# Verify the timer is active
systemctl enable certbot.timer
systemctl start certbot.timer
echo "✅ Auto-renewal timer enabled (runs daily, renews 30 days before expiry)"

# Create renewal hook to reload nginx
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'HOOK'
#!/bin/bash
/usr/bin/docker exec courtzon-frontend nginx -s reload 2>/dev/null || systemctl reload nginx 2>/dev/null || true
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

echo "✅ Renewal hook installed (reloads nginx after certificate renewal)"
echo ""
echo "Certificates location:"
echo "  /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "  /etc/letsencrypt/live/$DOMAIN/privkey.pem"
echo ""
echo "Test renewal manually:"
echo "  certbot renew --dry-run"
