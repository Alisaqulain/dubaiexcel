# 📊 Excel Features Location Guide

## Where to Find Excel Features

### 1. **Upload Excel Files** 📤
- **URL:** `/admin/upload`
- **Access:** 
  - ✅ **Admin users** - Full access
  - ✅ **E1 users** - If `canUpload: true` (default)
- **Navigation:** Click "Upload Excel" in the top navigation bar
- **Features:**
  - Upload single or multiple Excel files (.xlsx, .xls)
  - Auto-parse and validate data
  - Auto-merge into master attendance table
  - Real-time upload status

### 2. **Download Master Excel** 📥
- **URL:** `/reports/download-excel`
- **Access:** 
  - ✅ **Admin users only**
- **Navigation:** Click "Download Excel" in the top navigation bar (admin only)
- **Features:**
  - Generate master summary Excel file
  - Includes all attendance data grouped by sections
  - Formatted with totals and calculations
  - Download as `.xlsx` file

## Quick Access

### For Admin Users:
1. **Upload:** Top nav → "Upload Excel"
2. **Download:** Top nav → "Download Excel"

### For E1 Users:
1. **Upload:** Top nav → "Upload Excel" (if permission enabled)

## API Endpoints

### Upload Excel
```bash
POST /api/e1/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
Body: files (multiple files supported)
```

### Download Master Excel
```bash
GET /api/download/master-excel
Authorization: Bearer <admin-token>
```

## Troubleshooting

### "Admin access required" Error
- **Cause:** You're trying to access an admin-only feature
- **Solution:** 
  - For **upload**: Make sure you're logged in as admin OR as E1 user with `canUpload: true`
  - For **download**: You must be logged in as admin

### "Upload Excel" Link Not Showing
- **Cause:** Your account doesn't have upload permission
- **Solution:** 
  - Admin can enable upload permission in `/admin/users/[id]/edit`
  - Or contact admin to enable `canUpload` for your account

### Can't See Navigation Links
- **Cause:** Not logged in or insufficient permissions
- **Solution:** 
  - Log in at `/login`
  - Check your user role and permissions

## File Locations in Codebase

- **Upload Page:** `app/admin/upload/page.tsx`
- **Download Page:** `app/reports/download-excel/page.tsx`
- **Upload API:** `app/api/e1/upload/route.ts`
- **Download API:** `app/api/download/master-excel/route.ts`
- **Excel Parser:** `lib/excelParser.ts`
- **Master Generator:** `lib/masterExcelGenerator.ts`


























