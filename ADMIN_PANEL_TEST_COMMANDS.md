# Admin Panel Access Management - Test Commands

Complete test suite for the Admin Panel Access Management Module.

## Prerequisites

1. Start the development server:
```bash
npm run dev
```

2. Ensure MongoDB is connected and running.

## Test Sequence

### 1. Create Admin User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "Admin@123",
    "role": "admin",
    "fullName": "Admin User"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": "...",
    "email": "admin@test.com",
    "role": "admin",
    "fullName": "Admin User"
  }
}
```

**Save the token** for subsequent requests:
```bash
export ADMIN_TOKEN="<token_from_response>"
```

### 2. Create E1 User

```bash
curl -X POST http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "E1 User Test",
    "email": "e1user@test.com",
    "password": "E1User@123",
    "role": "e1-user",
    "isActive": true,
    "canUpload": true
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "fullName": "E1 User Test",
    "email": "e1user@test.com",
    "role": "e1-user",
    "isActive": true,
    "canUpload": true
  }
}
```

### 3. Login as E1 User

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "e1user@test.com",
    "password": "E1User@123"
  }'
```

**Save E1 user token:**
```bash
export E1_TOKEN="<token_from_response>"
```

### 4. Test Upload with E1 User (Should Succeed)

```bash
curl -X POST http://localhost:3000/api/e1/upload \
  -H "Authorization: Bearer $E1_TOKEN" \
  -F "files=@test_file.xlsx"
```

**Expected:** Upload succeeds, auto-merge triggers, upload log created.

### 5. Deactivate E1 User

```bash
curl -X POST http://localhost:3000/api/admin/users/<E1_USER_ID>/toggle-active \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "isActive": false
  },
  "message": "User deactivated successfully"
}
```

### 6. Test Upload with Inactive User (Should Fail)

```bash
curl -X POST http://localhost:3000/api/e1/upload \
  -H "Authorization: Bearer $E1_TOKEN" \
  -F "files=@test_file.xlsx"
```

**Expected:** `403 Forbidden - Account is inactive`

### 7. Reactivate User

```bash
curl -X POST http://localhost:3000/api/admin/users/<E1_USER_ID>/toggle-active \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 8. Disable Upload Permission

```bash
curl -X POST http://localhost:3000/api/admin/users/<E1_USER_ID>/toggle-upload \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "canUpload": false
  },
  "message": "Upload access disabled successfully"
}
```

### 9. Test Upload with Disabled Permission (Should Fail)

```bash
curl -X POST http://localhost:3000/api/e1/upload \
  -H "Authorization: Bearer $E1_TOKEN" \
  -F "files=@test_file.xlsx"
```

**Expected:** `403 Forbidden - Upload access is disabled for your account`

### 10. Reset User Password

```bash
curl -X POST http://localhost:3000/api/admin/users/<E1_USER_ID>/reset-password \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "newPassword": "NewPassword@123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

### 11. Test Login with New Password

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "e1user@test.com",
    "password": "NewPassword@123"
  }'
```

**Expected:** Login succeeds with new password.

### 12. Get All Users (Admin Only)

```bash
curl -X GET "http://localhost:3000/api/admin/users?page=1&limit=50&search=e1&role=e1-user" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Expected:** List of users with pagination.

### 13. Get User by ID

```bash
curl -X GET http://localhost:3000/api/admin/users/<USER_ID> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 14. Update User

```bash
curl -X PUT http://localhost:3000/api/admin/users/<USER_ID> \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Updated Name",
    "role": "admin",
    "isActive": true,
    "canUpload": true
  }'
```

### 15. Get Upload Logs

```bash
curl -X GET "http://localhost:3000/api/admin/uploads?page=1&limit=50" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Expected:** List of all upload logs with user information.

### 16. Delete User

```bash
curl -X DELETE http://localhost:3000/api/admin/users/<USER_ID> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**Expected:** User deleted successfully.

### 17. Verify Auto-Merge After Upload

1. Upload an Excel file as E1 user
2. Check upload log shows `status: "success"`
3. Check `/api/admin/master` to see merged data
4. Verify master Excel reflects new data

```bash
# Check master data
curl -X GET "http://localhost:3000/api/admin/master?page=1&limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Test Scenarios Summary

| Test | Action | Expected Result |
|------|--------|------------------|
| 1 | Create admin | Success, token returned |
| 2 | Create E1 user | Success, user created |
| 3 | Login E1 user | Success, token returned |
| 4 | Upload (active, canUpload=true) | Success, auto-merge triggered |
| 5 | Deactivate user | User isActive = false |
| 6 | Upload (inactive) | 403 Forbidden |
| 7 | Reactivate user | User isActive = true |
| 8 | Disable upload | User canUpload = false |
| 9 | Upload (canUpload=false) | 403 Forbidden |
| 10 | Reset password | Password changed |
| 11 | Login new password | Success |
| 12 | List users | Users list with filters |
| 13 | Get user | User details |
| 14 | Update user | User updated |
| 15 | Get logs | Upload logs list |
| 16 | Delete user | User deleted |
| 17 | Verify auto-merge | Data in master table |

## Security Tests

### Test 1: Unauthorized Access
```bash
curl -X GET http://localhost:3000/api/admin/users
```
**Expected:** `401 Unauthorized`

### Test 2: E1 User Accessing Admin Route
```bash
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer $E1_TOKEN"
```
**Expected:** `403 Forbidden - Admin access required`

### Test 3: Invalid Token
```bash
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer invalid_token"
```
**Expected:** `401 Unauthorized - Invalid or expired token`

## Sample Excel File for Testing

Create a test Excel file (`test_file.xlsx`) with the following structure:

| Employee ID | Name | Role | Site | Date | Time | Status |
|------------|------|------|------|------|------|--------|
| EMP001 | John Doe | Engineer | Site A | 2025-01-15 | 08:00 | Present |
| EMP002 | Jane Smith | Supervisor | Site B | 2025-01-15 | 08:30 | Present |
| EMP003 | Bob Johnson | Labour | Site C | 2025-01-15 | - | Absent |

## Notes

- All admin routes require `Authorization: Bearer <admin_token>`
- All upload routes check `isActive` and `canUpload` permissions
- Uploads automatically trigger merge process
- Upload logs are created for every upload attempt
- Passwords are hashed using bcrypt
- JWT tokens expire after 7 days (configurable)

## Troubleshooting

### "User not found" error
- Check user ID is correct
- Verify user exists in database

### "Cannot delete your own account"
- Admin cannot delete themselves
- Use another admin account

### "Cannot deactivate your own account"
- Admin cannot deactivate themselves
- Use another admin account

### Upload fails with 403
- Check user `isActive` status
- Check user `canUpload` permission
- Verify user role is `e1-user` or `admin`






