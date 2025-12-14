# Complete Testing Guide - Excel Pro Application

## 🚀 Quick Start

### Access the Application

The application is available at: **https://autoexcelpro.com/**

Simply open your web browser and navigate to the URL above.

---

## 📋 Step-by-Step Testing Guide

### Step 1: Login to the System

1. **Open browser**: Go to `https://autoexcelpro.com/`
2. **You'll be redirected to login page** (`/login`)
3. **Enter your credentials** provided by the administrator
4. **Click "Login"** to access the system

**Note**: If you don't have an account, please contact your system administrator to create one for you.

---

### Step 2: Admin Dashboard Overview

After login, you'll see:
- **Dashboard** - Real-time analytics
- **Excel Interface** - Upload/Create Excel files
- **All Files** - View all Excel files (admin only)
- **Users** - Manage user accounts (admin only)
- **Employees** - Manage employee data (admin only)
- **Logs** - View upload activity logs (admin only)
- **Download Excel** - Download master Excel report (admin only)
- **Clear Data** - Clear all static data (admin only)

---

### Step 3: Create Employee Accounts (Admin Only)

1. **Go to**: `https://autoexcelpro.com/admin/users`
2. **Click**: "Create User" button
3. **Fill the form**:
   - Full Name: `Employee One`
   - Email: `employee1@example.com`
   - Password: `emp123`
   - Role: `e1-user` (employee role)
   - Active: ✅ Checked
   - Can Upload: ✅ Checked
4. **Click**: "Create User"
5. **Repeat** to create more employees if needed

---

### Step 4: Test Employee Excel Upload

1. **Logout** as admin
2. **Login** as employee (use credentials provided by admin)
3. **Go to**: `https://autoexcelpro.com/excel`
4. **Click**: "Upload Excel" tab
5. **Select Excel file(s)** (.xlsx or .xls format)
6. **Click**: "Upload Files"
7. **Wait** for upload to complete
8. **Result**: File is saved and immediately visible to admin

**Note**: The Excel file should have columns like:
- Employee ID
- Name
- Role
- Site
- Date
- Time
- Status (Present/Absent/etc.)

---

### Step 5: Test Employee Excel Creation

1. **Still logged in as employee**
2. **Go to**: `https://autoexcelpro.com/excel`
3. **Click**: "Create Excel" tab
4. **Enter file name**: `MySpreadsheet`
5. **Add data** in the table:
   - Click cells to edit
   - Use "+ Add Row" and "+ Add Column" buttons
6. **Click**: "Save & Download Excel"
7. **Result**: 
   - File is downloaded to your computer
   - File is saved to database
   - Admin can see it immediately

---

### Step 6: Admin View All Files

1. **Logout** as employee
2. **Login** as admin
3. **Go to**: `https://autoexcelpro.com/admin/files`
4. **You'll see**:
   - All uploaded Excel files
   - All created Excel files
   - File details (name, type, creator, size, rows, date)
5. **Filter options**:
   - "All Files" - See everything
   - "Uploaded" - Only uploaded files
   - "Created" - Only created files
6. **Download individual files**: Click "Download" button on any file

---

### Step 7: Test Merge Functionality

1. **On the All Files page** (`/admin/files`)
2. **Make sure** you have multiple Excel files
3. **Click**: "Merge All" button (top right)
4. **Confirm** the merge
5. **Result**: 
   - All Excel files are merged into one file
   - Each file becomes a separate sheet
   - File is automatically downloaded
   - Named: `MERGED_FILES_YYYY-MM-DD.xlsx`

---

### Step 8: Test Dashboard Analytics

1. **Go to**: `https://autoexcelpro.com/dashboard`
2. **View real-time metrics**:
   - Total Headcount
   - Active Employees
   - Absent %
   - Present count
   - Vacation count
   - Various charts and visualizations
3. **Data updates** automatically when employees upload files

---

### Step 9: Test Employee Management

1. **Go to**: `https://autoexcelpro.com/admin/employees`
2. **View** all employees in the database
3. **Add new employee**:
   - Click "Add Employee"
   - Fill in details (Employee ID, Name, Site, Site Type, Role, Department)
   - Click "Create Employee"
4. **Employees** are automatically created when Excel files are uploaded (if they don't exist)

---

### Step 10: Test User Management

1. **Go to**: `https://autoexcelpro.com/admin/users`
2. **View** all users
3. **Test features**:
   - Search users by email/name
   - Filter by role (admin/e1-user)
   - Toggle active/inactive status
   - Toggle upload permission
   - Edit user details
   - Reset password
   - Delete user (cannot delete yourself)

---

### Step 11: Test Upload Logs

1. **Go to**: `https://autoexcelpro.com/admin/logs`
2. **View** all upload activity:
   - File name
   - Uploader
   - Upload time
   - Row count
   - Status (success/failed/processing)
   - Error messages (if any)

---

### Step 12: Test Master Excel Download

1. **Go to**: `https://autoexcelpro.com/reports/download-excel`
2. **Click**: "Download Master Excel"
3. **Result**: 
   - Generates master summary Excel file
   - Includes all attendance data
   - Organized by sections (HEAD OFFICE, MEP, CIVIL, etc.)
   - Includes totals and calculations

---

### Step 13: Test Clear Data (Optional - Use with Caution!)

1. **Go to**: `https://autoexcelpro.com/admin/clear-data`
2. **Read warnings** carefully
3. **Click**: "Clear All Static Data"
4. **Confirm** twice
5. **Result**: 
   - All attendance records deleted
   - All employees deleted
   - All upload records deleted
   - All upload logs deleted
   - **Users and Roles are preserved**

---

## 🧪 Test Scenarios

### Scenario 1: Complete Workflow
1. Admin creates employee account
2. Employee uploads Excel file
3. Admin sees file immediately in "All Files"
4. Admin merges all files
5. Admin downloads merged file
6. Dashboard shows updated analytics

### Scenario 2: Multiple Employees
1. Admin creates 3 employee accounts
2. Each employee uploads different Excel files
3. Admin views all files separately
4. Admin merges all files into one
5. Each file becomes a separate sheet in merged file

### Scenario 3: Excel Creation
1. Employee creates Excel file with custom data
2. Employee saves and downloads
3. Admin sees created file in "All Files"
4. Admin can download the created file

---

## 📝 Sample Excel File Format

For testing uploads, create an Excel file with these columns:

| Employee ID | Name | Role | Site | Date | Time | Status |
|------------|------|------|------|------|------|--------|
| EMP001 | John Doe | Engineer | Site A | 2024-01-15 | 09:00 | Present |
| EMP002 | Jane Smith | Manager | Site B | 2024-01-15 | 08:30 | Present |
| EMP003 | Bob Johnson | Worker | Site A | 2024-01-15 | - | Absent |

**Date formats accepted**: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
**Status values**: Present, Absent, Leave, Vacation, Sick Leave, Week Off, Visa Medical

---

## 🔍 Troubleshooting

### Issue: Can't login
- **Solution**: Contact your system administrator to get your login credentials
- Make sure you're using the correct email and password
- If you forgot your password, contact admin to reset it

### Issue: No files showing in "All Files"
- **Solution**: 
  - Make sure employees have uploaded/created files
  - Check browser console for errors
  - Verify database connection

### Issue: Upload fails
- **Solution**:
  - Check file format (.xlsx or .xls)
  - Verify employee has upload permission
  - Check file size (should be reasonable)
  - Check server logs for errors

### Issue: Merge not working
- **Solution**:
  - Make sure you have at least one file
  - Check that files are in "active" status
  - Verify file data exists in database

---

## 📊 Expected Results

After testing, you should have:
- ✅ Admin account created
- ✅ Employee accounts created
- ✅ Excel files uploaded by employees
- ✅ Excel files created by employees
- ✅ All files visible to admin
- ✅ Merged file downloaded
- ✅ Dashboard showing analytics
- ✅ Upload logs recorded

---

## 🎯 Key Features to Test

1. **Authentication**: Login/Logout
2. **User Management**: Create, edit, delete users
3. **Employee Management**: View, add employees
4. **Excel Upload**: Upload multiple files
5. **Excel Creation**: Create and save Excel files
6. **File Management**: View all files, download individual files
7. **Merge Operation**: Merge all files into one
8. **Dashboard**: Real-time analytics
9. **Upload Logs**: Activity tracking
10. **Master Excel**: Download summary report

---

## 💡 Tips

- Use different browsers/incognito windows to test multiple users simultaneously
- Create test Excel files with various formats to test parsing
- Check browser console (F12) for any errors
- Contact support if you encounter any technical issues
- All your Excel files are automatically saved and visible to administrators

---

## 🚨 Important Notes

- **First user becomes admin** automatically (if created via API)
- **Employees cannot create accounts** - only admin can
- **All Excel files are immediately visible to admin** after upload/creation
- **Merge operation** combines all active files into one Excel file
- **Dashboard updates** automatically when data changes
- **Clear Data** is permanent - use with caution!

---

Happy Testing! 🎉

