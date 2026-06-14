# 🚀 Nzamy — Linux VPS Deployment Guide

> **Target**: Linux VPS with **aaPanel** (SSL + Nginx) + **PM2** (process manager)
> **Stack**: Next.js 16 · Supabase Cloud · n8n (self-hosted) · Evolution API
> **Last Updated**: 2026-06-05

---

## 📋 Prerequisites

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| **RAM** | 2 GB | 4 GB+ |
| **CPU** | 1 vCPU | 2 vCPU+ |
| **Disk** | 20 GB SSD | 40 GB+ SSD |
| **Domain** | ✅ Required | e.g. `nzamy.com` |
| **DNS** | A record → VPS IP | A + CNAME (`www`) |

---

## 🔧 Step 1: Server Preparation

### 1.1 SSH into your VPS

```bash
ssh root@YOUR_VPS_IP
```

### 1.2 Update system

```bash
apt update && apt upgrade -y
```

### 1.3 Install aaPanel (if not installed)

```bash
URL=https://www.aapanel.com/script/install_7.0_en.sh && \
  if [ -f /usr/bin/curl ]; then curl -ksSO "$URL"; else wget --no-check-certificate -O install_7.0_en.sh "$URL"; fi && \
  bash install_7.0_en.sh aapanel
```

> After installation, note the **aaPanel URL**, **username**, and **password** from the terminal output.

### 1.4 Install essential packages via aaPanel

Login to aaPanel web UI → **App Store** → Install:
- ✅ **Nginx** (latest stable)
- ✅ **PM2 Manager** (if available as plugin)

> [!NOTE]
> We install Node.js via terminal (not aaPanel) for better version control.

---

## 📦 Step 2: Install Node.js & PM2

### 2.1 Install Node.js 20 LTS (via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

Verify:
```bash
node -v   # should be v20.x.x
npm -v    # should be 10.x.x
```

### 2.2 Install PM2 globally

```bash
npm install -g pm2
```

### 2.3 Set PM2 to start on boot

```bash
pm2 startup systemd
# Run the command it outputs (copy-paste exactly)
```

---

## 📂 Step 3: Deploy the Project

### 3.1 Clone the repository

```bash
mkdir -p /www/wwwroot/nzamy
cd /www/wwwroot/nzamy
git clone https://github.com/drjimmy1990/latest-nzamy-full.git
cd latest-nzamy-full
```

> [!TIP]
> Your project lives at `/www/wwwroot/nzamy/latest-nzamy-full`. All commands below use this path.

### 3.2 Install dependencies

```bash
npm install
```

### 3.3 Create environment file

```bash
cp .env.example .env.local
nano .env.local
```

Fill in all values:

```env
# ─── Supabase (REQUIRED) ───────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUz...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUz...your-service-role-key

# ─── Backend Mode (REQUIRED) ───────────────────────────
NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase

# ─── App URL ────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://nzamy.com

# ─── n8n (Phase 4 — fill when ready) ───────────────────
# N8N_WEBHOOK_URL=https://n8n.nzamy.com/webhook
# N8N_API_KEY=your-n8n-api-key

# ─── WhatsApp / Evolution API (Phase 4) ────────────────
# EVOLUTION_API_URL=https://evo.nzamy.com
# EVOLUTION_API_KEY=your-evolution-key

# ─── Payment Gateway (Phase 3 — TBD) ──────────────────
# MOYASAR_API_KEY=
# TAP_API_KEY=
```

> [!CAUTION]
> Never commit `.env.local` to git. It contains secrets.

---

## 🏗️ Step 4: Build & Start with PM2

### 4.1 Build the production bundle

```bash
npm run build
```

> This compiles all 34 API routes and 27+ pages. Takes ~2-4 minutes depending on VPS specs.

### 4.2 PM2 ecosystem file

> [!TIP]
> The `ecosystem.config.js` is already in the repo — no need to create it. It was pushed with the correct path `/www/wwwroot/nzamy/latest-nzamy-full`.

### 4.3 Create logs directory

```bash
mkdir -p /www/wwwroot/nzamy/latest-nzamy-full/logs
```

### 4.4 Start the app

```bash
pm2 start ecosystem.config.js
```

### 4.5 Verify it's running

```bash
pm2 status
# Should show: nzamy │ online │ 0 │ fork │ ...

pm2 logs nzamy --lines 20
# Should show: ▲ Next.js 16 ... Ready in ...

# Quick test:
curl http://localhost:3000
# Should return HTML
```

### 4.6 Save PM2 process list (persist across reboots)

```bash
pm2 save
```

---

## 🌐 Step 5: Configure Nginx (via aaPanel)

### 5.1 Add Website in aaPanel

1. Login to **aaPanel** web UI
2. Go to **Website** → **Add site**
3. Fill in:
   - **Domain**: `nzamy.com` (also add `www.nzamy.com`)
   - **Root Directory**: `/www/wwwroot/nzamy/latest-nzamy-full`
   - **PHP Version**: Select **Pure static** (we don't need PHP)
4. Click **Submit**

### 5.2 Configure Nginx Reverse Proxy

1. Click on your site name → **Config** (or **Settings**)
2. Find the **Configuration file** tab (Nginx config)
3. **Replace** the `location /` block with this:

```nginx
server {
    listen 80;
    server_name nzamy.com www.nzamy.com;

    # aaPanel will add SSL config here after Step 6

    # ─── Security Headers ──────────────────────────────────
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # ─── Gzip Compression ──────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript
               application/xml+rss application/atom+xml image/svg+xml;

    # ─── Static Assets (Next.js _next/) ────────────────────
    location /_next/static/ {
        alias /www/wwwroot/nzamy/latest-nzamy-full/.next/static/;
        expires 365d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # ─── Public Assets ─────────────────────────────────────
    location /images/ {
        alias /www/wwwroot/nzamy/latest-nzamy-full/public/images/;
        expires 30d;
        add_header Cache-Control "public";
        access_log off;
    }

    location /fonts/ {
        alias /www/wwwroot/nzamy/latest-nzamy-full/public/fonts/;
        expires 365d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location /favicon.ico {
        alias /www/wwwroot/nzamy/latest-nzamy-full/public/favicon.ico;
        expires 30d;
        access_log off;
    }

    location /sitemap.xml {
        alias /www/wwwroot/nzamy/latest-nzamy-full/public/sitemap.xml;
        expires 1d;
        access_log off;
    }

    location /robots.txt {
        alias /www/wwwroot/nzamy/latest-nzamy-full/public/robots.txt;
        expires 1d;
        access_log off;
    }

    # ─── Reverse Proxy to Next.js ──────────────────────────
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts for long API calls
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 120s;

        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }

    # ─── Block sensitive paths ─────────────────────────────
    location ~ /\.(git|env|next) {
        deny all;
        return 404;
    }

    # ─── Error pages ───────────────────────────────────────
    error_page 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }

    # Logs
    access_log /www/wwwlogs/nzamy.com.log;
    error_log /www/wwwlogs/nzamy.com.error.log;
}
```

4. Click **Save**
5. **Test & Reload** Nginx:

```bash
nginx -t && systemctl reload nginx
```

### 5.3 Test HTTP access

Open `http://nzamy.com` in your browser — you should see the site.

---

## 🔒 Step 6: SSL Certificate (via aaPanel)

### 6.1 Install SSL

1. In aaPanel → **Website** → click your site → **SSL**
2. Select **Let's Encrypt**
3. Check both domains: `nzamy.com` and `www.nzamy.com`
4. Select **File verification** (recommended)
5. Click **Apply**

### 6.2 Enable Force HTTPS

After the certificate is issued:
1. Toggle **Force HTTPS** → ON
2. aaPanel will automatically add the `listen 443 ssl` block and redirect `80 → 443`

### 6.3 Verify SSL

```bash
curl -I https://nzamy.com
# Should show: HTTP/2 200
# Should show: strict-transport-security header
```

### 6.4 Auto-Renewal

aaPanel handles Let's Encrypt auto-renewal automatically via its built-in cron job. No action needed.

> [!TIP]
> To verify renewal is scheduled: aaPanel → **Cron** → look for "Renew Let's Encrypt certificate"

---

## 🔗 Step 7: Connect Supabase

### 7.1 Verify Supabase connection

```bash
curl -s https://nzamy.com/api/v1/profile \
  -H "Cookie: sb-access-token=INVALID" \
  | head -c 200
# Should return 401 Unauthorized (means Supabase connection works)
```

### 7.2 Configure Supabase Auth redirect URLs

In **Supabase Dashboard** → **Authentication** → **URL Configuration**:

| Setting | Value |
|---------|-------|
| **Site URL** | `https://nzamy.com` |
| **Redirect URLs** | `https://nzamy.com/auth/callback` |
| | `https://nzamy.com/dashboard/**` |
| | `https://www.nzamy.com/auth/callback` |

### 7.3 Configure Google OAuth (if using)

In **Supabase Dashboard** → **Authentication** → **Providers** → **Google**:
- **Authorized redirect URI**: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
- Add `https://nzamy.com` to Google Console's authorized origins

---

## 📊 Step 8: Monitoring & Logs

### 8.1 PM2 Monitoring

```bash
# Live status
pm2 status

# Live logs (follow mode)
pm2 logs nzamy

# Detailed metrics
pm2 monit

# Process info
pm2 show nzamy
```

### 8.2 PM2 Web Dashboard (optional)

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### 8.3 Nginx Logs

```bash
# Access log
tail -f /www/wwwlogs/nzamy.com.log

# Error log
tail -f /www/wwwlogs/nzamy.com.error.log
```

### 8.4 Quick Health Check Script

Create `/www/wwwroot/nzamy/latest-nzamy-full/health-check.sh`:

```bash
#!/bin/bash
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://nzamy.com)
if [ "$STATUS" != "200" ]; then
  echo "[$(date)] ❌ Site DOWN (HTTP $STATUS) — restarting PM2..." >> /www/wwwroot/nzamy/latest-nzamy-full/logs/health.log
  pm2 restart nzamy
else
  echo "[$(date)] ✅ Site UP (HTTP $STATUS)" >> /www/wwwroot/nzamy/latest-nzamy-full/logs/health.log
fi
```

```bash
chmod +x /www/wwwroot/nzamy/latest-nzamy-full/health-check.sh
```

Add to aaPanel **Cron** → **Shell Script** → Run every 5 minutes:
```
/www/wwwroot/nzamy/latest-nzamy-full/health-check.sh
```

---

## 🔄 Step 9: Deployment Updates (CI/CD Lite)

### 9.1 Manual Update Script

Create `/www/wwwroot/nzamy/latest-nzamy-full/deploy.sh`:

```bash
#!/bin/bash
set -e

APP_DIR="/www/wwwroot/nzamy/latest-nzamy-full"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Deploying Nzamy..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$APP_DIR"

# 1. Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# 2. Install dependencies (if changed)
echo "📦 Installing dependencies..."
npm install --production=false

# 3. Build
echo "🏗️ Building production bundle..."
npm run build

# 4. Restart PM2
echo "♻️ Restarting app..."
pm2 restart nzamy

# 5. Verify
sleep 3
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
if [ "$STATUS" = "200" ]; then
  echo "✅ Deploy successful! (HTTP $STATUS)"
else
  echo "❌ Deploy might have failed (HTTP $STATUS)"
  echo "Check logs: pm2 logs nzamy --lines 50"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Done at $(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

```bash
chmod +x /www/wwwroot/nzamy/latest-nzamy-full/deploy.sh
```

Usage:
```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && ./deploy.sh
```

### 9.2 Zero-Downtime Restart

For zero-downtime deploys, use PM2 reload:

```bash
# In deploy.sh, replace:
pm2 restart nzamy
# With:
pm2 reload nzamy
```

> [!NOTE]
> `reload` does a graceful restart — new requests go to the new process while old requests finish on the old process.

---

## 🛡️ Step 10: Security Hardening

### 10.1 Firewall (UFW)

```bash
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw allow 8888/tcp   # aaPanel (change if you use a custom port)
ufw enable
ufw status
```

> [!WARNING]
> Make sure to allow your aaPanel port before enabling UFW, or you'll lock yourself out of the panel.

### 10.2 Secure aaPanel

1. **Change default port**: aaPanel → **Settings** → **Panel Port** → change from `8888` to something random (e.g., `29847`)
2. **Change admin password**: Settings → **Admin** → update credentials
3. **Enable BasicAuth**: Settings → **BasicAuth** → ON
4. **Bind IP** (optional): Settings → **Authorized IP** → add only your IP

### 10.3 Fail2Ban (optional but recommended)

```bash
apt install fail2ban -y
systemctl enable fail2ban
systemctl start fail2ban
```

### 10.4 Block sensitive files (already in Nginx config)

The Nginx config above already blocks:
- `.git/` — source code history
- `.env*` — environment variables
- `.next/` — build internals

---

## 💾 Step 11: Backup Strategy

### 11.1 What to back up

| Data | Location | Method |
|------|----------|--------|
| **Code** | `/www/wwwroot/nzamy/latest-nzamy-full` | Git (already versioned) |
| **Env vars** | `.env.local` | Manual backup (never in git) |
| **PM2 config** | `ecosystem.config.js` | Git (in repo) |
| **Database** | Supabase Cloud | Supabase automatic backups |
| **Nginx config** | aaPanel manages | aaPanel backup plugin |
| **Logs** | `/www/wwwroot/nzamy/latest-nzamy-full/logs/` | pm2-logrotate (auto) |

### 11.2 aaPanel Backup

1. aaPanel → **App Store** → install **Backup** plugin
2. Configure daily backup of:
   - Website files (only `.env.local` needed — `ecosystem.config.js` is in git)
   - Nginx configurations

### 11.3 Quick manual backup

```bash
mkdir -p /root/backups
cp /www/wwwroot/nzamy/latest-nzamy-full/.env.local /root/backups/nzamy-env-$(date +%Y%m%d).bak
```

---

## 🐛 Troubleshooting

### Common Issues

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| **502 Bad Gateway** | PM2 not running or crashed | `pm2 restart nzamy && pm2 logs nzamy` |
| **Site loads but API fails** | Missing env vars | Check `.env.local` has all Supabase keys |
| **Build fails** | Memory issue on small VPS | Add swap: see below |
| **SSL not working** | Certificate not issued | aaPanel → SSL → reissue. Check DNS A record |
| **Can't SSH** | UFW blocked SSH | Use VPS console (provider panel) to fix |
| **Slow first load** | Next.js cold start | Normal. Use PM2 `--max-memory-restart` to keep alive |
| **Auth redirect loops** | Wrong Supabase redirect URLs | Check Step 7.2 |

### Add Swap (if build fails on 2GB RAM)

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Emergency Recovery

```bash
APP_DIR="/www/wwwroot/nzamy/latest-nzamy-full"

# Check if PM2 process exists
pm2 list

# If no process, start fresh
cd $APP_DIR
pm2 start ecosystem.config.js

# If build is corrupted
cd $APP_DIR
rm -rf .next
npm run build
pm2 restart nzamy

# If node_modules corrupted
cd $APP_DIR
rm -rf node_modules package-lock.json
npm install
npm run build
pm2 restart nzamy
```

### Useful Commands Cheatsheet

```bash
# ─── PM2 ───────────────────────────────
pm2 status                    # List processes
pm2 logs nzamy                # View logs
pm2 restart nzamy             # Hard restart
pm2 reload nzamy              # Graceful restart
pm2 stop nzamy                # Stop app
pm2 delete nzamy              # Remove from PM2
pm2 monit                     # Live dashboard

# ─── Nginx ─────────────────────────────
nginx -t                      # Test config
systemctl reload nginx        # Reload config
systemctl restart nginx       # Full restart
tail -f /www/wwwlogs/nzamy.com.error.log

# ─── System ────────────────────────────
htop                          # CPU/Memory monitor
df -h                         # Disk usage
free -h                       # Memory usage
uptime                        # Server uptime
```

---

## ✅ Deployment Checklist

Run through this before going live:

- [ ] **DNS**: A record points to VPS IP
- [ ] **SSH**: Can access VPS via SSH
- [ ] **aaPanel**: Installed and secured
- [ ] **Node.js**: v20.x installed
- [ ] **PM2**: Installed globally + startup configured
- [ ] **Code**: Cloned to `/www/wwwroot/nzamy/latest-nzamy-full`
- [ ] **Env**: `.env.local` created with all Supabase keys
- [ ] **Backend mode**: `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase`
- [ ] **Build**: `npm run build` succeeds
- [ ] **PM2**: App running (`pm2 status` → online)
- [ ] **Nginx**: Reverse proxy configured + working
- [ ] **SSL**: Let's Encrypt issued + Force HTTPS enabled
- [ ] **Supabase**: Redirect URLs configured
- [ ] **Firewall**: UFW enabled (22, 80, 443, aaPanel port)
- [ ] **Health check**: Cron job running
- [ ] **Deploy script**: `deploy.sh` created + tested
- [ ] **Backup**: `.env.local` backed up
- [ ] **Test**: Open `https://nzamy.com` → site loads
- [ ] **Test**: Register new user → verify in Supabase
- [ ] **Test**: Login → dashboard loads with real data
