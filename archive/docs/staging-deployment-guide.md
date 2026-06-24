# CourtZon Staging Deployment Guide

## Prerequisites

1. Hostinger KVM 2 (or similar) running Ubuntu 24.04
2. Docker & Docker Compose installed
3. Node.js 22 installed (for local development)
4. Cloudflare account (for DNS + Tunnel)
5. Coolify instance running (or use manual Docker Compose)

## Step 1: Server Setup

```bash
# SSH into the VPS
ssh root@<vps-ip>

# Update system
apt update && apt upgrade -y
apt install -y docker.io docker-compose-v2 nodejs npm git curl

# Enable Docker
systemctl enable docker
systemctl start docker

# Create app directory
mkdir -p /opt/courtzon
cd /opt/courtzon
```

## Step 2: Clone & Configure

```bash
# Clone the repository
git clone https://github.com/<your-org>/courtzon-v2.git .
git checkout main

# Copy production env
cp .env.production .env
nano .env  # Fill in all secrets
```

## Step 3: Set Up MySQL

The production MySQL runs on the host (not Docker — data persistence):
- Install MySQL 8: `apt install mysql-server-8.0`
- Run `mysql_secure_installation`
- Create databases and users: `mysql -u root -p < backend/scripts/setup-db-users.sql`
- Copy `database/my.cnf` to `/etc/mysql/my.cnf`
- Restart MySQL: `systemctl restart mysql`
- Run migrations: `node backend/scripts/migrate.js`

## Step 4: Set Up Cloudflare Tunnel

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create courtzon-staging

# Configure DNS
cloudflared tunnel route dns courtzon-staging api-staging.courtzon.com
cloudflared tunnel route dns courtzon-staging staging.courtzon.com
```

Create `/root/.cloudflared/config.yml`:
```yaml
tunnel: <tunnel-uuid>
credentials-file: /root/.cloudflared/<tunnel-uuid>.json

ingress:
  - hostname: staging.courtzon.com
    service: http://localhost:5173
  - hostname: api-staging.courtzon.com
    service: http://localhost:3000
  - service: http_status:404
```

```bash
# Run tunnel as systemd service
cloudflared install
systemctl start cloudflared
```

## Step 5: Build & Start Docker

```bash
docker compose build backend frontend
docker compose up -d
```

Verify:
```bash
curl -f http://localhost:3000/health
curl -f http://localhost:5173
```

## Step 6: Run Staging Tests

```bash
# Backend tests
cd backend && npx vitest run --reporter=verbose

# Deployment checks
node scripts/deploy-check.js --staging
```

## Step 7: Verify Core Flows

Access via staging domain and verify:
1. ✅ User registration → login → dashboard
2. ✅ Create product with variants
3. ✅ Place order → process payment (Paymob sandbox)
4. ✅ Admin settle sellers
5. ✅ Upload files
6. ✅ Admin UI permissions screen
7. ✅ Role-based access (seller vs admin)
8. ✅ Session persistence across page reloads
9. ✅ Multi-tenant isolation (user from org A cannot see org B data)
10. ✅ Error pages (404, 500) don't leak stack traces

## Staging URLs

| Service | URL |
|---------|-----|
| Frontend | `https://staging.courtzon.com` |
| API | `https://api-staging.courtzon.com` |
| Health check | `https://api-staging.courtzon.com/health` |

## Production Cutover (after staging sign-off)

1. Change Cloudflare DNS to point to production VPS IP
2. Update `CORS_ORIGINS` in `.env` to production domains
3. Run `scripts/setup-ssl.sh courtzon.com` to get TLS certs
4. Run `node scripts/deploy-check.js --production`
5. Verify all core flows on production
6. Lower DNS TTL to 60s before cutover, raise after
