# How to Create Admin Account

## Method 1: Using API (Recommended)

### Step 1: Register Admin User via API

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@123",
    "role": "admin",
    "fullName": "System Admin"
  }'
```

**Default Admin Credentials (if you use above):**
- **Email:** `admin@example.com`
- **Password:** `Admin@123`
- **Role:** `admin`

### Step 2: Login

Go to `http://localhost:3000/login` and login with:
- Email: `admin@example.com`
- Password: `Admin@123`

---

## Method 2: Using Seed Script

### Step 1: Update Seed Script (if needed)

The seed script needs to match the new User model. Run:

```bash
node scripts/seed-admin.js
```

**Default credentials from seed script:**
- **Email:** `admin@example.com` (or from ADMIN_EMAIL env var)
- **Password:** `Admin@123` (or from ADMIN_PASSWORD env var)

### Step 2: Set Environment Variables (Optional)

Add to `.env.local`:
```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@123
```

Then run:
```bash
node scripts/seed-admin.js
```

---

## Method 3: Using Web Interface + Manual Role Update

1. Register via web interface at `/login`
2. Note the user ID from the response
3. Update role to admin via API:

```bash
curl -X PUT http://localhost:3000/api/admin/users/<USER_ID> \
  -H "Authorization: Bearer <FIRST_USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "admin"
  }'
```

---

## Quick Test

After creating admin, test login:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin@123"
  }'
```

You should receive a JWT token in the response.

---

## Important Notes

1. **No Default Admin** - You must create the first admin account
2. **Change Password** - Change the default password after first login
3. **First User** - The first registered user should be an admin
4. **Security** - Use strong passwords in production

---

## Troubleshooting

### "User already exists"
- Admin account already created
- Try logging in with the credentials
- Or delete the user and recreate

### "Authentication failed"
- Check email and password are correct
- Verify user exists in database
- Check user is active (`isActive: true`)

### "Admin access required"
- User role is not 'admin'
- Update user role via API or database














