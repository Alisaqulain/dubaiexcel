# Production Deployment Guide - KVM2 Server

## Quick Start Commands

### 1. SSH to KVM2

```bash
ssh <user>@<kvm2-ip>
```

### 2. Install Node.js, Git, NPM

```bash
sudo apt update
sudo apt install -y git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Clone Repository & Install

```bash
git clone <repo-url> app
cd app
cp .env.example .env.local
nano .env.local  # Edit with your MongoDB URI and JWT_SECRET
npm install
npm run build
```

### 4a. Run with PM2

```bash
npm install -g pm2
pm2 start npm --name "manpower-app" -- start
pm2 save
pm2 startup
# Follow the command output to complete setup
```

### 4b. Run with Docker

```bash
docker build -t manpower-app:latest .
docker run -d -p 3000:3000 --env-file .env.local --name manpower-app manpower-app:latest
```

### 5. Setup Nginx Reverse Proxy

```bash
sudo apt install -y nginx
sudo rm /etc/nginx/sites-enabled/default
sudo tee /etc/nginx/sites-available/manpower <<'NGINX'
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX
sudo ln -s /etc/nginx/sites-available/manpower /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. Setup SSL (Optional)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

### 7. Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Post-Deploy Testing

### Register User

```bash
curl -X POST http://<kvm2-ip>/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"u1@example.com","password":"Test@123","role":"uploader"}'
```

### Login

```bash
curl -X POST http://<kvm2-ip>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"u1@example.com","password":"Test@123"}'
```

### Upload Excel

```bash
curl -X POST http://<kvm2-ip>/api/e1/upload \
  -H "Authorization: Bearer <token>" \
  -F "files=@/path/to/e1_file1.xlsx" \
  -F "files=@/path/to/e1_file2.xlsx"
```

### Trigger Merge

```bash
curl -X POST http://<kvm2-ip>/api/merge/trigger \
  -H "Authorization: Bearer <admin-token>"
```

### Download Master Excel

```bash
curl -X GET http://<kvm2-ip>/api/download/master-excel \
  -H "Authorization: Bearer <admin-token>" \
  --output MASTER.xlsx
```

## Monitoring

### PM2 Commands

```bash
pm2 status          # Check status
pm2 logs            # View logs
pm2 restart all     # Restart app
pm2 stop all        # Stop app
pm2 monit           # Monitor dashboard
```

### Nginx Logs

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Application Logs

```bash
pm2 logs manpower-app
```

## Maintenance

### Update Application

```bash
cd app
git pull
npm install
npm run build
pm2 restart manpower-app
```

### Backup Database

```bash
# MongoDB Atlas - use Atlas backup feature
# Or use mongodump for local MongoDB
mongodump --uri="mongodb+srv://..." --out=/backup/$(date +%Y%m%d)
```

## Troubleshooting

### Application Not Starting

1. Check PM2 status: `pm2 status`
2. Check logs: `pm2 logs manpower-app`
3. Verify .env.local file
4. Check MongoDB connection

### Nginx 502 Error

1. Check if app is running: `pm2 status`
2. Check app logs: `pm2 logs`
3. Verify proxy_pass URL in nginx config
4. Check firewall: `sudo ufw status`

### MongoDB Connection Issues

1. Verify MONGODB_URI in .env.local
2. Check MongoDB Atlas network access
3. Verify credentials
4. Test connection: `mongosh "<MONGODB_URI>"`

