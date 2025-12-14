# Test Data Guide

## Sample E1 Excel File Format

E1 Excel files should contain the following columns (column names can vary - system auto-detects):

### Required Columns:
- **Employee ID**: `empId`, `employee_id`, `emp id`, `id`
- **Name**: `name`, `employee name`, `full name`
- **Date**: `date`, `attendance date`, `att_date`
- **Status**: `status`, `attendance`, `present/absent`

### Optional Columns:
- **Role**: `role`, `designation`, `position`
- **Site**: `site`, `location`, `project`, `camp`
- **Time**: `time`, `time in`, `check in`

## Sample Data Structure

### Example Row 1:
| Employee ID | Name | Role | Site | Date | Time | Status |
|------------|------|------|------|------|------|--------|
| EMP001 | John Doe | Engineer | Site A | 2025-01-15 | 08:00 | Present |

### Example Row 2:
| Employee ID | Name | Role | Site | Date | Time | Status |
|------------|------|------|------|------|------|--------|
| EMP002 | Jane Smith | Supervisor | Site B | 2025-01-15 | 08:30 | Present |

### Example Row 3:
| Employee ID | Name | Role | Site | Date | Time | Status |
|------------|------|------|------|------|------|--------|
| EMP003 | Bob Johnson | Labour | Site C | 2025-01-15 | - | Absent |

## Status Values

Accepted status values:
- `Present` or `P`
- `Absent` or `A`
- `Leave`
- `Vacation`
- `Sick Leave`
- `Week Off`
- `Visa Medical`

## Date Formats

Accepted date formats:
- `YYYY-MM-DD` (e.g., 2025-01-15)
- `DD/MM/YYYY` (e.g., 15/01/2025)
- `DD-MM-YYYY` (e.g., 15-01-2025)

## Time Formats

Accepted time formats:
- `HH:MM` (e.g., 08:00)
- `HH:MM:SS` (e.g., 08:00:00)
- `HH:MM AM/PM` (e.g., 08:00 AM)

## Creating Test Excel Files

### Using Excel:
1. Create a new Excel file
2. Add headers in first row
3. Add data rows
4. Save as `.xlsx` format

### Using Python (for bulk generation):
```python
import pandas as pd
from datetime import datetime, timedelta

data = {
    'Employee ID': ['EMP001', 'EMP002', 'EMP003'],
    'Name': ['John Doe', 'Jane Smith', 'Bob Johnson'],
    'Role': ['Engineer', 'Supervisor', 'Labour'],
    'Site': ['Site A', 'Site B', 'Site C'],
    'Date': ['2025-01-15', '2025-01-15', '2025-01-15'],
    'Time': ['08:00', '08:30', ''],
    'Status': ['Present', 'Present', 'Absent']
}

df = pd.DataFrame(data)
df.to_excel('test_e1_file.xlsx', index=False)
```

## Testing Upload

1. Create test Excel file with above format
2. Login to system
3. Go to `/admin/upload` (admin) or use API
4. Upload the file
5. Check `/admin/master` to see merged data
6. Download master Excel from `/reports/download-excel`

## Column Mapping

If your Excel files have different column names, the system will auto-detect common variations. For custom mappings, you can:

1. Use the admin mapping UI (if implemented)
2. Rename columns in Excel to match standard names
3. Contact admin to add custom mapping rules

## Validation

The system validates:
- ✅ Employee ID is not empty
- ✅ Date is not empty and valid format
- ✅ Status is not empty
- ✅ Role exists in roles table (if provided)
- ✅ Time format is valid (if provided)
- ⚠️ Duplicate records (empId + date) - will update existing

## Common Issues

### "Employee ID is required"
- Ensure the column contains employee IDs
- Check column name matches variations

### "Date format may be invalid"
- Use one of the accepted date formats
- Ensure dates are not empty

### "Status may not be standard"
- Use one of the accepted status values
- Check for typos

### "Role not found"
- Create role in `/admin/roles` first
- Or leave role column empty (will use default)

