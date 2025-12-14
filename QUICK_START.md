# Quick Start Guide

## 1. Local Development (5 minutes)

```bash
# Clone and install
git clone <repo-url> manpower-system
cd manpower-system
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your MongoDB URI

# Run development server
npm run dev
```

Open http://localhost:3000

## 2. Create First Admin User

1. Go to http://localhost:3000/login
2. Click "Register"
3. Enter:
   - Email: `admin@example.com`
   - Password: `Admin@123`
4. Click "Register"

## 3. Upload Test Excel File

1. Create an Excel file with columns:
   - Employee ID
   - Name
   - Date
   - Status (Present/Absent)
   - (Optional) Role, Site, Time

2. Go to http://localhost:3000/admin/upload
3. Select your Excel file
4. Click "Upload Files"
5. System will auto-merge data

## 4. View Dashboard

1. Go to http://localhost:3000/dashboard
2. See real-time metrics and charts

## 5. Download Master Excel

1. Go to http://localhost:3000/reports/download-excel
2. Click "Download Master Excel"
3. Get the formatted summary file

## API Testing

### Using cURL:

```bash
# 1. Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@123"}'

# 2. Login (save token from response)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@123"}'

# 3. Upload (use token from step 2)
curl -X POST http://localhost:3000/api/e1/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@test.xlsx"

# 4. Trigger merge (admin only)
curl -X POST http://localhost:3000/api/merge/trigger \
  -H "Authorization: Bearer ADMIN_TOKEN"

# 5. Download master Excel
curl -X GET http://localhost:3000/api/download/master-excel \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  --output MASTER.xlsx
```

### Using Postman:

1. Import `postman_collection.json`
2. Set `base_url` variable to `http://localhost:3000`
3. Run "Login" request (token auto-saved)
4. Run other requests

## Production Deployment

See `DEPLOYMENT.md` for complete KVM2 deployment instructions.

## Troubleshooting

### MongoDB Connection Error
- Check `.env.local` has correct `MONGODB_URI`
- Verify MongoDB Atlas network access
- Test connection: `mongosh "<MONGODB_URI>"`

### Upload Fails
- Check file is `.xlsx` or `.xls` format
- Verify authentication token
- Check browser console for errors

### Dashboard Empty
- Upload some Excel files first
- Run merge: `POST /api/merge/trigger`
- Check MongoDB has data

## Next Steps

- Read `README.md` for full documentation
- Check `TEST_DATA_GUIDE.md` for Excel format details
- See `DEPLOYMENT.md` for production setup

