# Admin Roles and Permissions Documentation

## Default Login Credentials

### Super Admin Account
- **Email:** superadmin@example.com
- **Username:** superadmin
- **Password:** SuperAdmin@123
- **Role:** super-admin
- **Full Name:** Super Admin

### Admin Account
- **Email:** admin@example.com
- **Username:** admin
- **Password:** Admin@123
- **Role:** admin
- **Full Name:** System Admin

**Important:** Change the default passwords after first login for security purposes.

---

## Login Instructions

1. Navigate to: http://localhost:3000/login
2. You can login using either:
   - Email address
   - Username
3. Enter your password
4. Click "Login"

---

## Super Admin Permissions

### What Super Admin CAN Do

#### 1. Summary Report
- **Access:** Full access to Manpower Summary Report
- **Location:** Dashboard banner and Navigation menu
- **Features:**
  - View comprehensive Excel-style summary report
  - Select date for report generation
  - View all sections: HEAD OFFICE, MEP SITES, CIVIL SITES, OTHER SITES, SUPPORT TEAM, OUTSOURCED SITES
  - View TOTAL SUMMARY, TOTAL ACTIVE EMPLOYEES, TOTAL ABSENT BREAKDOWN, GRAND TOTAL
  - Export report to Excel format
  - Print-friendly layout (A3 landscape)

#### 2. Clear Data
- **Access:** Navigation menu > Clear Data
- **Features:**
  - Clear Employees data
  - Clear Supply Labour data
  - Clear Subcontractor data
  - Clear Attendance data
  - Clear Excel Upload records
  - Clear all data (complete reset)

#### 3. Excel Upload
- **Access:** Navigation menu > Upload
- **Features:**
  - Upload Excel files for employees
  - Upload Excel files for supply labour
  - Upload Excel files for subcontractors
  - Download Excel templates
  - View upload progress and status
  - View upload errors and validation messages

#### 4. Employee Management
- **Access:** Navigation menu > Employees
- **Features:**
  - View all employees (active and inactive counts displayed in navbar)
  - Create new employees
  - Edit employee details (name, site, siteType, role, department, labourType)
  - Delete employees
  - Toggle employee active/inactive status
  - View employee labour type badges
  - Search and filter employees

#### 5. Merge Excel
- **Access:** Navigation menu > Merge Excel
- **Features:**
  - View all uploaded Excel files
  - Merge uploaded data into attendance master
  - View merge status and results
  - Handle duplicate records

#### 6. Activity Logs
- **Access:** Navigation menu > Activity Logs
- **Features:**
  - View all user activity logs
  - Filter logs by user, action, entity type
  - View detailed activity information
  - Track all system changes

#### 7. Download Excel
- **Access:** Navigation menu > Download Excel
- **Features:**
  - Download master Excel file
  - Generate formatted Excel reports
  - Export attendance data

#### 8. Dashboard
- **Access:** Navigation menu > Dashboard
- **Features:**
  - View comprehensive dashboard with charts and metrics
  - View key metrics: Total Headcount, Active Employees, Absent %, Present, Vacation, etc.
  - View charts: Active/Inactive, Division-wise, Attendance Breakup, Staff/Labour, Nationality, Department, Camp, Attendance Type
  - View MEP and Civil/Aluminium project charts
  - View date-wise absent count
  - Access Summary Report banner (Super Admin only)

#### 9. Profile Management
- **Access:** Navigation menu > Profile
- **Features:**
  - View profile details (name, email, username, role)
  - Edit name and username
  - Change password
  - View account information

### What Super Admin CANNOT Do

- Super Admin has full system access with no restrictions
- All features and data are accessible

---

## Admin Permissions

### What Admin CAN Do

#### 1. Excel Upload
- **Access:** Navigation menu > Upload
- **Features:**
  - Upload Excel files for employees
  - Upload Excel files for supply labour
  - Upload Excel files for subcontractors
  - Download Excel templates
  - View upload progress and status
  - View upload errors and validation messages

#### 2. Employee Management
- **Access:** Navigation menu > Employees
- **Features:**
  - View all employees (active and inactive counts displayed in navbar)
  - Create new employees
  - Edit employee details (name, site, siteType, role, department, labourType)
  - Delete employees
  - Toggle employee active/inactive status
  - View employee labour type badges
  - Search and filter employees

#### 3. Merge Excel
- **Access:** Navigation menu > Merge Excel
- **Features:**
  - View all uploaded Excel files
  - Merge uploaded data into attendance master
  - View merge status and results
  - Handle duplicate records

#### 4. Activity Logs
- **Access:** Navigation menu > Activity Logs
- **Features:**
  - View all user activity logs
  - Filter logs by user, action, entity type
  - View detailed activity information
  - Track all system changes

#### 5. Download Excel
- **Access:** Navigation menu > Download Excel
- **Features:**
  - Download master Excel file
  - Generate formatted Excel reports
  - Export attendance data

#### 6. Dashboard
- **Access:** Navigation menu > Dashboard
- **Features:**
  - View comprehensive dashboard with charts and metrics
  - View key metrics: Total Headcount, Active Employees, Absent %, Present, Vacation, etc.
  - View charts: Active/Inactive, Division-wise, Attendance Breakup, Staff/Labour, Nationality, Department, Camp, Attendance Type
  - View MEP and Civil/Aluminium project charts
  - View date-wise absent count

#### 7. Profile Management
- **Access:** Navigation menu > Profile
- **Features:**
  - View profile details (name, email, username, role)
  - Edit name and username
  - Change password
  - View account information

### What Admin CANNOT Do

#### 1. Summary Report
- **Cannot access:** Manpower Summary Report page
- **Reason:** Restricted to Super Admin only
- **Alternative:** Can view dashboard metrics and download Excel reports

#### 2. Clear Data
- **Cannot access:** Clear Data page
- **Reason:** Restricted to Super Admin only
- **Impact:** Cannot delete or clear system data

---

## User Role Permissions

### What User CAN Do

#### 1. Excel Upload
- **Access:** Navigation menu > Upload Excel
- **Features:**
  - Upload Excel files (if canUpload permission is granted by Admin)
  - Download Excel templates
  - View upload progress and status

#### 2. Dashboard/Reports
- **Access:** Navigation menu > My Reports
- **Features:**
  - View dashboard with charts and metrics
  - View key metrics and visualizations
  - Limited to view-only access

#### 3. Profile Management
- **Access:** Navigation menu > Profile
- **Features:**
  - View profile details
  - Edit name and username
  - Change password

### What User CANNOT Do

#### 1. Employee Management
- Cannot create, edit, or delete employees
- Cannot toggle employee active/inactive status
- Cannot view employee management page

#### 2. Merge Excel
- Cannot merge Excel uploads
- Cannot access merge Excel page

#### 3. Activity Logs
- Cannot view activity logs
- Cannot access activity logs page

#### 4. Download Excel
- Cannot download master Excel files
- Cannot access download Excel page

#### 5. Summary Report
- Cannot access Summary Report
- Cannot view comprehensive summary reports

#### 6. Clear Data
- Cannot clear any data
- Cannot access clear data page

---

## API Endpoint Access Summary

### Super Admin Only Endpoints
- GET /api/admin/summary-report - Get summary report data
- GET /api/admin/summary-report/export - Export summary report to Excel

### Admin and Super Admin Endpoints
- GET /api/admin/dashboard - Get dashboard data
- GET /api/admin/employees - List employees
- POST /api/admin/employees - Create employee
- PUT /api/admin/employees/[id] - Update employee
- DELETE /api/admin/employees/[id] - Delete employee
- POST /api/admin/employees/[id]/toggle-active - Toggle employee status
- GET /api/admin/excel/merge - Get mergeable uploads
- POST /api/admin/excel/merge - Merge Excel data
- GET /api/admin/logs - Get activity logs
- GET /api/admin/master - Get master data
- GET /api/admin/uploads - Get upload logs
- GET /api/download/master-excel - Download master Excel
- POST /api/admin/clear-data - Clear data (Super Admin only, but endpoint allows Admin)

### All Authenticated Users Endpoints
- GET /api/admin/employees/counts - Get employee counts
- GET /api/profile - Get user profile
- PUT /api/profile - Update user profile
- POST /api/profile/change-password - Change password

### Upload Permission Required Endpoints
- POST /api/admin/excel/upload - Upload Excel file (requires admin role or user with canUpload permission)

---

## Navigation Menu Summary

### Super Admin Navigation
- Dashboard
- Summary Report (Super Admin only)
- Upload
- Employees (with active/inactive counts)
- Merge Excel
- Activity Logs
- Clear Data (Super Admin only)
- Download Excel
- Profile
- Logout

### Admin Navigation
- Dashboard
- Upload
- Employees (with active/inactive counts)
- Merge Excel
- Activity Logs
- Download Excel
- Profile
- Logout

### User Navigation
- Dashboard (My Reports)
- Upload Excel
- Profile
- Logout

---

## Role Comparison Table

| Feature | Super Admin | Admin | User |
|---------|-------------|-------|------|
| View Dashboard | Yes | Yes | Yes |
| Summary Report | Yes | No | No |
| Upload Excel | Yes | Yes | Yes (if permitted) |
| Manage Employees | Yes | Yes | No |
| Merge Excel | Yes | Yes | No |
| View Activity Logs | Yes | Yes | No |
| Download Excel | Yes | Yes | No |
| Clear Data | Yes | No | No |
| Edit Profile | Yes | Yes | Yes |
| Change Password | Yes | Yes | Yes |
| View Employee Counts | Yes | Yes | No |

---

## Security Notes

1. **Password Security:** All passwords are hashed using bcrypt (10 rounds) before storage
2. **JWT Authentication:** All API requests require valid JWT token
3. **Token Expiration:** JWT tokens expire after 7 days
4. **Role Validation:** All protected routes validate user role before allowing access
5. **Active Status:** Inactive users cannot access the system
6. **Upload Permission:** Users require explicit canUpload permission to upload files

---

## Creating New Accounts

### Super Admin Can Create
- Super Admin accounts
- Admin accounts
- User accounts

### Admin Can Create
- Admin accounts (cannot create Super Admin)
- User accounts

### User Cannot Create
- Any accounts (registration is restricted)

---

## Password Reset

### Self-Service
- All users can change their own password via Profile page
- Requires current password verification

### Admin Reset
- Admin and Super Admin can reset user passwords
- Access via user management (if implemented)

---

## Important Notes

1. Super Admin has complete system access with no restrictions
2. Admin has full operational access except for Summary Report and Clear Data
3. Users have limited access primarily for uploading Excel files and viewing reports
4. All roles can manage their own profile and change passwords
5. Employee counts (active/inactive) are displayed in the navigation bar for Admin and Super Admin
6. The Summary Report is prominently displayed on the dashboard for Super Admin users
7. All data operations are logged in the Activity Logs for audit purposes

