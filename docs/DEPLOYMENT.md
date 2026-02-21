# Deployment Guide

Complete guide for deploying Otakuin API to production environments.

---

## Prerequisites

Before deploying, complete the following setup guides in order:

1. **[Database Setup](./DATABASE-SETUP.md)** - Configure Supabase PostgreSQL database
2. **[Cloudflare Workers Setup](./WORKERS-SETUP.md)** - Deploy video streaming proxy
3. **[GitHub Action Setup](./GITHUB-ACTION-SETUP.md)** - Setup automated video uploads
4. **[Token Management](./TOKEN-MANAGEMENT.md)** - Generate and configure all tokens

**Verify all prerequisites are complete before proceeding.**

---

## Deployment Options

Choose the deployment method that best fits your environment:

- **[PM2](#pm2-deployment)** - Recommended for VPS/dedicated servers
- **[Docker](#docker-deployment)** - Containerized deployment
- **[Systemd](#systemd-deployment)** - Native Linux service

---

## PM2 Deployment

### Install PM2

```bash
npm install -g pm2
```

### Start Application

```bash
# Start with PM2
pm2 start bun --name "otakuin-api" -- run start

# Save PM2 configuration
pm2 save

# Setup auto-restart on server reboot
pm2 startup
```

### PM2 Management

```bash
# View logs
pm2 logs otakuin-api

# Restart
pm2 restart otakuin-api

# Stop
pm2 stop otakuin-api

# Monitor
pm2 monit
```

### PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'otakuin-api',
    script: 'bun',
    args: 'run start',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

Start with:

```bash
pm2 start ecosystem.config.js
```

## Docker Deployment

### Dockerfile

Create `Dockerfile`:

```dockerfile
FROM oven/bun:latest

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production

COPY . .

EXPOSE 3000

CMD ["bun", "run", "start"]
```

### Build and Run

```bash
# Build image
docker build -t otakuin-api .

# Run container
docker run -d \
  --name otakuin-api \
  -p 3000:3000 \
  --env-file .env \
  otakuin-api

# View logs
docker logs -f otakuin-api
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs
```

Run with:

```bash
docker-compose up -d
```

## Systemd Service

### Create Service File

Create `/etc/systemd/system/otakuin-api.service`:

```ini
[Unit]
Description=Otakuin API Service
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/otakuin-api
ExecStart=/usr/local/bin/bun run start
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Enable and Start

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable otakuin-api

# Start service
sudo systemctl start otakuin-api

# Check status
sudo systemctl status otakuin-api

# View logs
sudo journalctl -u otakuin-api -f
```

## Nginx Reverse Proxy

### Configuration

Create `/etc/nginx/sites-available/otakuin-api`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/otakuin-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

## Environment Variables

Production `.env` example:

```env
SUPABASE_URL=https://prod.supabase.co
SUPABASE_ANON_KEY=prod_key
SAMEHADAKU_BASE_URL=https://v1.samehadaku.how
ANIMASU_BASE_URL=https://v0.animasu.app
LOG_LEVEL=INFO
WORKER_VIDEO_PROXY_URL=https://anime-video-proxy.workers.dev
PRIMARY_STORAGE_ACCOUNT=storage-account-1
```

## Health Check

Create health check endpoint for monitoring:

```bash
# Check if API is running
curl http://localhost:3000/api/docs

# Expected: HTTP 200
```

## Backup Strategy

Database backup (Supabase):
- Automatic backups enabled in Supabase dashboard
- Point-in-time recovery available

Application backup:
```bash
# Backup codebase
tar -czf otakuin-api-backup-$(date +%Y%m%d).tar.gz /path/to/otakuin-api

# Backup .env
cp .env .env.backup
```

## Monitoring

Recommended tools:
- PM2 monitoring dashboard
- Supabase database metrics
- Cloudflare Workers analytics
- Custom logging with LOG_LEVEL=INFO

---

## Related Documentation

- **[API Reference](./API.md)** - Complete API endpoint documentation
- **[Database Setup](./DATABASE-SETUP.md)** - Database configuration and maintenance
- **[Cloudflare Workers Setup](./WORKERS-SETUP.md)** - Video streaming proxy setup
- **[GitHub Action Setup](./GITHUB-ACTION-SETUP.md)** - Automated video upload configuration
- **[Token Management](./TOKEN-MANAGEMENT.md)** - Token rotation and security

---

## Support

For issues or questions:

1. Check **[Troubleshooting](#troubleshooting)** sections in each guide
2. Create issue on GitHub repository
