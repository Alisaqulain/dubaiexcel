# Manpower Attendance Automation System

Production-ready Manpower Attendance Automation System that converts daily E1 Excel files into a master "SUMMARY OF MANPOWER" Excel file with exact layout and calculations.

## Features

- ✅ Accept unlimited E1 Excel uploads (single or multiple files)
- ✅ Auto-parse, validate, and push raw rows to MongoDB Atlas
- ✅ Auto-merge & validate into master attendance table
- ✅ Auto-generate MASTER Excel file matching sample layout
- ✅ Live admin dashboard with real-time updates
- ✅ Role-based access: Admin + E1 Uploader
- ✅ Backend APIs for upload, merge, validation, dashboard, download
- ✅ Production-ready deployment scripts

## Tech Stack

- **Frontend**: Next.js 14 + TypeScript + TailwindCSS + Recharts
- **Backend**: Next.js API Routes (Node.js)
- **Database**: MongoDB Atlas (Mongoose)
- **Excel Processing**: xlsx (parsing) + exceljs (generation)
- **Authentication**: JWT + bcrypt
- **Real-time**: Socket.io (optional)

## Prerequisites

- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- Git

## Local Development Setup

### 1. Clone and Install

```bash
git clone <repo-url> manpower-system
cd manpower-system
npm install
```

### 2. Environment Variables

Create `.env.local` file:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/manpower?retryWrites=true&w=majority
JWT_SECRET=change_this_to_a_strong_secret_in_production
PORT=3000
NODE_ENV=development
SOCKET_ENABLED=true
ADMIN_EMAIL=admin@example.com
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Create Admin User

1. Go to `/login`
2. Click "Register"
3. Register with email and password (first user becomes admin by default)
4. Or use API:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@123","role":"admin"}'
```

## Production Deployment (KVM2 Server)

### Step 1: SSH to KVM2

```bash
ssh <user>@<kvm2-ip>
```

### Step 2: Install Node.js, Git, NPM

```bash
sudo apt update
sudo apt install -y git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify installation:
```bash
node --version
npm --version
```

### Step 3: Clone Repository & Install

```bash
git clone <repo-url> app
cd app
cp .env.example .env.local
# Edit .env.local with your MongoDB URI and JWT_SECRET
nano .env.local
npm install
npm run build
```

### Step 4a: Deploy with PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start npm --name "manpower-app" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the command output to complete setup
```

PM2 Commands:
```bash
pm2 status          # Check status
pm2 logs            # View logs
pm2 restart all     # Restart app
pm2 stop all        # Stop app
```

### Step 4b: Deploy with Docker (Alternative)

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t manpower-app:latest .
docker run -d -p 3000:3000 --env-file .env.local --name manpower-app manpower-app:latest
```

### Step 5: Setup Nginx Reverse Proxy

```bash
sudo apt install -y nginx
sudo rm /etc/nginx/sites-enabled/default
```

Create Nginx configuration:
```bash
sudo tee /etc/nginx/sites-available/manpower <<'NGINX'
server {
    listen 80;
    server_name example.com;  # Replace with your domain

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
    }
}
NGINX
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/manpower /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 6: Setup SSL (Optional - Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

### Step 7: Firewall Configuration

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### E1 Upload

- `POST /api/e1/upload` - Upload Excel files (requires auth)

### Merge & Processing

- `POST /api/merge/trigger` - Trigger merge process (admin only)

### Admin APIs

- `GET /api/admin/dashboard` - Get dashboard data (admin only)
- `GET /api/admin/master` - Get master attendance data (admin only)
- `GET /api/admin/employees` - Get employees list (admin only)
- `POST /api/admin/employees` - Create employee (admin only)
- `GET /api/admin/roles` - Get roles list (admin only)
- `POST /api/admin/roles` - Create role (admin only)

### Download

- `GET /api/download/master-excel` - Download master Excel (admin only)

## Testing

### Post-Deploy Test Commands (cURL)

1. **Register User:**
```bash
curl -X POST http://<kvm2-ip>/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"u1@example.com","password":"Test@123","role":"uploader"}'
```

2. **Login (Get Token):**
```bash
curl -X POST http://<kvm2-ip>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"u1@example.com","password":"Test@123"}'
```

Save the token from response.

3. **Upload Excel:**
```bash
curl -X POST http://<kvm2-ip>/api/e1/upload \
  -H "Authorization: Bearer <token>" \
  -F "files=@/path/to/e1_file1.xlsx" \
  -F "files=@/path/to/e1_file2.xlsx"
```

4. **Trigger Merge (Admin):**
```bash
curl -X POST http://<kvm2-ip>/api/merge/trigger \
  -H "Authorization: Bearer <admin-token>"
```

5. **Download Master Excel:**
```bash
curl -X GET http://<kvm2-ip>/api/download/master-excel \
  -H "Authorization: Bearer <admin-token>" \
  --output MASTER.xlsx
```

6. **Get Dashboard Data:**
```bash
curl -X GET http://<kvm2-ip>/api/admin/dashboard \
  -H "Authorization: Bearer <admin-token>"
```

### Postman Collection

Import `postman_collection.json` into Postman for complete API testing.

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   │   ├── auth/         # Authentication
│   │   ├── e1/           # E1 upload
│   │   ├── merge/         # Merge processing
│   │   ├── admin/        # Admin APIs
│   │   └── download/      # Download APIs
│   ├── components/       # React components
│   ├── context/          # React context (Auth)
│   ├── admin/            # Admin pages
│   ├── dashboard/        # Dashboard page
│   ├── login/            # Login page
│   └── reports/           # Reports pages
├── lib/                  # Utilities
│   ├── mongodb.ts        # DB connection
│   ├── jwt.ts            # JWT utilities
│   ├── middleware.ts     # Auth middleware
│   ├── validation.ts     # Validation engine
│   ├── excelParser.ts    # Excel parsing
│   └── masterExcelGenerator.ts  # Master Excel generation
├── models/               # Mongoose schemas
│   ├── User.ts
│   ├── Employee.ts
│   ├── Role.ts
│   ├── AttendanceRaw.ts
│   ├── AttendanceMaster.ts
│   └── Upload.ts
├── .env.example          # Environment template
├── README.md             # This file
└── package.json
```

## Database Schemas

### Users
- email, password, role (admin/uploader), active

### Employees
- empId, name, site, siteType, role, department, active

### Roles
- name, allowedStatuses, description

### AttendanceRaw
- fileId, uploaderId, filename, rows[], status

### AttendanceMaster
- empId, name, role, site, date, time, status, validation

### Uploads
- fileId, filename, uploaderId, parsedRowsCount, status

## Validation Rules

- Role must exist in roles table
- No empty mandatory fields (empId, date, status)
- Time format validation
- Status must be Present/Absent/Leave/Vacation/etc.
- Duplicate detection (empId + date)
- Returns validation as OK / ERROR / WARNING

## Master Excel Generator

Generates Excel with sections:
- HEAD OFFICE
- MEP SITES
- CIVIL SITES
- OTHER SITES
- OUTSOURCED
- SUPPORT TEAM
- MANAGEMENT
- MD REFERENCE
- VACATION
- INACTIVE
- ABSCONDED-RUN AWAY
- GRAND TOTAL

Each section includes:
- Role-wise Present/Absent counts
- Section totals
- Absent percentage
- Grand totals

## Troubleshooting

### MongoDB Connection Issues
- Verify MONGODB_URI in .env.local
- Check MongoDB Atlas network access (whitelist IP)
- Verify database user credentials

### Upload Fails
- Check file format (must be .xlsx or .xls)
- Verify authentication token
- Check file size limits

### Merge Fails
- Ensure employees exist in database
- Check validation errors in attendance_raw
- Verify date formats

### Dashboard Not Loading
- Verify admin role
- Check API authentication
- Review browser console for errors

## Security Notes

- Change JWT_SECRET in production
- Use strong passwords
- Enable HTTPS in production
- Regularly update dependencies
- Monitor MongoDB access logs

## License

MIT

## Support

For issues and questions, please open an issue in the repository.
#   d u b a i e x c e l  
 