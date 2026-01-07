# AutoExcelPro Website Documentation

## Overview

AutoExcelPro is a comprehensive Excel file management and attendance tracking system built with Next.js, MongoDB, and TypeScript. The platform enables organizations to manage employee data, create and validate Excel files, track attendance, and generate reports through a web-based interface.

**Website URL:** https://autoexcelpro.com

## System Architecture

### Technology Stack

- **Frontend:** Next.js 14 (React), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Node.js
- **Database:** MongoDB with Mongoose ODM
- **Authentication:** JWT (JSON Web Tokens)
- **File Processing:** XLSX library for Excel operations

### User Roles

The system supports four distinct user roles with different permission levels:

1. **Super Admin** - Full system access including data management and format creation
2. **Admin** - Operational access for managing employees and viewing reports
3. **User** - Limited access for uploading Excel files and viewing reports
4. **Employee** - Access to create and upload Excel files using assigned formats

## Authentication System

### Login Process

1. Navigate to https://autoexcelpro.com/login
2. Enter email/username and password
3. System validates credentials against MongoDB User collection
4. JWT token is generated and stored in browser localStorage
5. Token expires after 7 days, requiring re-authentication

### Authentication Flow

- All API requests require JWT token in Authorization header
- Protected routes validate token and user role before allowing access
- Inactive users cannot access the system
- Passwords are hashed using bcrypt (10 rounds) before storage

## Core Features

### 1. Excel Format Management

**Location:** https://autoexcelpro.com/admin/excel-formats

Super Admin can create and manage Excel formats that define the structure employees must follow when creating Excel files.

**Features:**
- Create custom Excel formats with defined columns
- Specify column types (text, number, date, email, dropdown)
- Set validation rules (required fields, min/max values, dropdown options)
- Assign formats to all employees or specific employees
- View format examples directly on screen (no download required)
- Edit and delete existing formats

**Format Assignment Options:**
- Assign to All: Format is available to all employees
- Assign to Specific Employees: Format is only available to selected employees
- Not Assign to Anyone: Format is unassigned and not available to any employee

### 2. Employee Management

**Location:** https://autoexcelpro.com/admin/employees

Admins can manage employee accounts and assign Excel formats.

**Features:**
- Create employees individually or in bulk
- Bulk upload employees via Excel template
- Edit employee details (name, site, role, department, etc.)
- Activate/deactivate employee accounts
- Assign Excel formats to employees
- View active/inactive employee counts in navigation bar
- Filter employees by status (all, active, inactive)

**Format Assignment:**
- When editing an employee, admins can assign/unassign Excel formats
- Formats assigned to "all" are automatically checked
- Formats can be assigned to specific employees individually

### 3. Employee Dashboard

**Location:** https://autoexcelpro.com/dashboard (for employees)

Employees can create and upload Excel files using their assigned formats.

**Features:**
- View all assigned Excel formats
- See format examples on screen (column structure with sample rows)
- Create Excel files online using assigned format
- Upload existing Excel files (validated against assigned format)
- View upload history
- Download templates for assigned formats

**Strict Format Enforcement:**
- Employees can only use formats assigned to them
- All Excel files are validated against assigned format before save/upload
- Validation checks column names, types, required fields, and data formats
- Files that don't match format are rejected with detailed error messages

### 4. Excel File Creation

**Location:** Employee Dashboard > Work with Format

Employees can create Excel files directly in the browser.

**Features:**
- Add rows individually or in bulk
- Paste data from Excel/CSV
- Import data from existing Excel/CSV files
- Real-time validation against assigned format
- Save files to database for admin review
- Download created files

**Validation:**
- Column structure must match assigned format exactly
- Required fields must be filled
- Data types must match format specifications
- Dropdown values must be from allowed options

### 5. Excel File Upload

**Location:** https://autoexcelpro.com/admin/upload (for admins/users) or Employee Dashboard (for employees)

Users can upload existing Excel files.

**Features:**
- Upload Excel files (.xlsx, .xls)
- Automatic format validation before upload
- Support for three labour types: Our Labour, Supply Labour, Subcontractor
- Project ID assignment (for users)
- Upload progress tracking
- Error reporting and validation messages

**Upload Process:**
1. Select labour type
2. Choose Excel file
3. System validates file against assigned format
4. If valid, file is processed and data is imported
5. If invalid, detailed error message is shown with required format structure

### 6. Created Excel Files Management

**Location:** https://autoexcelpro.com/admin/created-excel-files

Admins can view, manage, merge, and delete Excel files created by employees.

**Features:**
- View all Excel files created by employees
- Filter by labour type
- Download individual files
- Merge multiple files into one
- Delete files
- View file metadata (creator, date, row count, type)
- Format assignment management (assign to all or unassign from everyone)

**File Types:**
- Original files: Created directly by employees
- Merged files: Combined from multiple original files

**Merge Functionality:**
- Select multiple files using checkboxes
- Merge creates a new combined Excel file
- Merged file is saved to database with history tracking
- Source files are linked to merged file for audit trail

### 7. Summary Report

**Location:** https://autoexcelpro.com/admin/summary-report (Super Admin only)

Comprehensive manpower summary report with Excel export capability.

**Features:**
- Date-based report generation
- Multiple site categories: Head Office, MEP Sites, Civil Sites, Other Sites, Support Team, Outsourced Sites
- Total summary calculations
- Active employee counts
- Absent employee breakdown
- Export to Excel format
- Print-friendly layout (A3 landscape)

### 8. Activity Logs

**Location:** https://autoexcelpro.com/admin/logs

System-wide activity tracking for audit purposes.

**Features:**
- Track all user actions
- Filter by user, action type, and date range
- View detailed activity information
- Export logs for external analysis

## Data Models

### User Model

Stores system users (super-admin, admin, user roles).

**Fields:**
- email: Unique email address
- username: Optional unique username
- password: Hashed password
- role: User role (super-admin, admin, user)
- name: Full name
- active: Account status
- allottedProjects: Array of project IDs

### Employee Model

Stores employee information.

**Fields:**
- empId: Unique employee ID
- name: Employee name
- site: Work site location
- siteType: Type of site (HEAD_OFFICE, MEP, CIVIL, OTHER, OUTSOURCED, SUPPORT)
- role: Job role
- department: Department name
- password: Hashed password
- active: Employment status
- labourType: Type of labour (OUR_LABOUR, SUPPLY_LABOUR, SUBCONTRACTOR)
- projectId: Associated project ID

### ExcelFormat Model

Defines Excel file structure templates.

**Fields:**
- name: Format name
- description: Format description
- columns: Array of column definitions
  - name: Column name
  - type: Data type (text, number, date, email, dropdown)
  - required: Whether field is required
  - validation: Validation rules (min, max, options)
  - order: Column order
- assignedTo: Array of employee/user IDs
- assignedToType: Assignment type (all, employee, user)
- createdBy: Creator user ID
- active: Format status

### CreatedExcelFile Model

Stores Excel files created by employees.

**Fields:**
- filename: Generated filename
- originalFilename: Original filename
- fileData: Excel file binary data
- labourType: Labour type
- rowCount: Number of data rows
- createdBy: Creator ID (employee or user)
- createdByName: Creator name
- createdByEmail: Creator email
- isMerged: Whether file is a merged file
- mergedFrom: Array of source file IDs
- mergedDate: Date of merge operation

## API Endpoints

### Authentication

- POST /api/auth/login - User login
- POST /api/auth/register - User registration (restricted)

### Admin Endpoints

- GET /api/admin/excel-formats - Get all Excel formats
- POST /api/admin/excel-formats - Create new format
- PUT /api/admin/excel-formats/[id] - Update format
- DELETE /api/admin/excel-formats/[id] - Delete format
- GET /api/admin/excel-formats/[id]/download - Download format template

- GET /api/admin/employees - Get all employees
- POST /api/admin/employees - Create employee(s)
- PUT /api/admin/employees/[id] - Update employee
- DELETE /api/admin/employees/[id] - Delete employee
- POST /api/admin/employees/[id]/assign-format - Assign format to employee

- GET /api/admin/created-excel-files - Get all created files
- GET /api/admin/created-excel-files/[id]/download - Download file
- POST /api/admin/created-excel-files/merge - Merge files
- DELETE /api/admin/created-excel-files/[id] - Delete file

- POST /api/admin/excel/upload - Upload Excel file
- GET /api/admin/summary-report - Get summary report
- GET /api/admin/summary-report/export - Export report to Excel

### Employee Endpoints

- GET /api/employee/excel-formats - Get assigned formats
- GET /api/employee/excel-format - Get first assigned format
- GET /api/employee/excel-formats/[id]/download - Download format template
- POST /api/employee/save-excel - Save created Excel file
- POST /api/employee/validate-excel-format - Validate Excel file
- GET /api/employee/uploads - Get employee upload history

## Workflow Examples

### Creating and Assigning an Excel Format

1. Super Admin navigates to Excel Formats page
2. Clicks "Create Format"
3. Enters format name and description
4. Adds columns with types and validation rules
5. Sets assignment type (all, specific employees, or none)
6. Saves format
7. Format is immediately available to assigned employees

### Employee Creating an Excel File

1. Employee logs in and navigates to dashboard
2. Views assigned formats with example structure
3. Clicks "Work with this Format"
4. Adds data rows (manually, bulk, or import)
5. System validates data against format in real-time
6. Employee clicks "Save Excel"
7. System validates file against format
8. If valid, file is saved to database
9. Admin can view file in Created Excel Files page

### Employee Uploading an Excel File

1. Employee navigates to dashboard
2. Selects "Upload Excel File"
3. Chooses Excel file from computer
4. System validates file against assigned format
5. If validation fails, detailed error message is shown
6. Employee fixes file and re-uploads
7. If valid, file is processed and saved

### Admin Managing Created Files

1. Admin navigates to Created Excel Files page
2. Views all files with metadata
3. Can filter by labour type
4. Can select multiple files and merge them
5. Merged file is saved with history tracking
6. Can download individual or merged files
7. Can delete files if needed

## Security Features

### Authentication Security

- JWT tokens with 7-day expiration
- Password hashing with bcrypt (10 rounds)
- Role-based access control
- Token validation on all protected routes

### Data Validation

- Format validation before file save/upload
- Column structure validation
- Data type validation
- Required field validation
- Dropdown option validation

### Access Control

- Route protection based on user role
- API endpoint protection with middleware
- Employee-specific format access
- Admin-only operations restricted

## Database Structure

### Collections

1. **users** - System users (super-admin, admin, user)
2. **employees** - Employee accounts
3. **excelformats** - Excel format definitions
4. **createdexcelfiles** - Excel files created by employees
5. **exceluploads** - Excel upload records
6. **attendances** - Attendance data
7. **activitylogs** - System activity logs

### Relationships

- ExcelFormat.assignedTo references Employee._id or User._id
- CreatedExcelFile.createdBy references Employee._id or User._id
- CreatedExcelFile.mergedFrom references CreatedExcelFile._id array

## File Processing

### Excel File Operations

- Reading Excel files using XLSX library
- Writing Excel files with proper formatting
- Merging multiple Excel files
- Validating file structure against formats
- Converting between JSON and Excel formats

### File Storage

- Excel files stored as binary data in MongoDB
- Files are converted to Buffer for storage
- Files are streamed for download
- No file system storage required

## Error Handling

### Validation Errors

- Detailed error messages for format mismatches
- Missing column identification
- Data type mismatch warnings
- Required field validation errors
- Example format structure provided in errors

### System Errors

- Graceful error handling in API routes
- User-friendly error messages
- Error logging for debugging
- Fallback error responses

## Performance Considerations

### Database Optimization

- Indexed fields for faster queries
- Lean queries where possible
- Efficient population of references
- Cached employee counts

### File Processing

- Streaming for large file downloads
- Efficient buffer handling
- Optimized Excel parsing
- Batch operations for bulk uploads

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design for mobile and desktop
- No browser-specific features required

## Deployment

The application is deployed at https://autoexcelpro.com and uses:
- Next.js production build
- MongoDB cloud database
- Server-side rendering for SEO
- API routes for backend functionality

## Support and Maintenance

### Regular Tasks

- Monitor activity logs for system health
- Review employee uploads for data quality
- Manage Excel format updates
- Maintain user and employee accounts
- Backup database regularly

### Troubleshooting

- Check activity logs for error patterns
- Validate format assignments
- Review file validation errors
- Monitor API response times
- Check database connection status

## Future Enhancements

Potential improvements include:
- Advanced reporting features
- Email notifications
- File versioning
- Bulk format updates
- Enhanced validation rules
- API rate limiting
- File compression for storage

