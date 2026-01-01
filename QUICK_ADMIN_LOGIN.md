# Quick Admin Login Guide

## You're at the Login Page - Here's How to Get Admin Access

### Step 1: Create Admin Account via API

**Open a new terminal/command prompt** (keep the server running) and run:

**Windows (PowerShell):**
```powershell
curl.exe -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d '{\"email\":\"admin@example.com\",\"password\":\"Admin@123\",\"role\":\"admin\",\"fullName\":\"Admin User\"}'
```

**Or use this simpler method:**

1. Open PowerShell or Command Prompt
2. Run this command:

```bash
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"admin@example.com\",\"password\":\"Admin@123\",\"role\":\"admin\",\"fullName\":\"Admin User\"}"
```

**Or create a file `create-admin.bat` (Windows) with:**
```batch
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"admin@example.com\",\"password\":\"Admin@123\",\"role\":\"admin\",\"fullName\":\"Admin User\"}"
pause
```

### Step 2: Login with Admin Credentials

After creating the admin account, go back to your browser at `http://localhost:3000/login` and login with:

- **Email:** `admin@example.com`
- **Password:** `Admin@123`

Click "Login" button.

---

## Alternative: Use Browser Console

If you prefer, you can also create admin via browser console:

1. **Open browser console** (F12 or Right-click → Inspect → Console)
2. **Paste this code:**

```javascript
fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'admin@example.com',
    password: 'Admin@123',
    role: 'admin',
    fullName: 'Admin User'
  })
})
.then(res => res.json())
.then(data => {
  if (data.success) {
    console.log('✅ Admin created! Now login with:');
    console.log('Email: admin@example.com');
    console.log('Password: Admin@123');
  } else {
    console.error('Error:', data.error);
  }
});
```

3. **Press Enter** to run
4. **Then login** with the credentials shown

---

## If Admin Already Exists

If you get "User already exists" error:

1. **Try logging in** with:
   - Email: `admin@example.com`
   - Password: `Admin@123`

2. **If login fails**, the password might be different. You can:
   - Use the seed script: `node scripts/seed-admin.js`
   - Or reset password via database

---

## Quick Summary

1. **Create admin** (via API or browser console)
2. **Go to login page** (you're already there!)
3. **Enter credentials:**
   - Email: `admin@example.com`
   - Password: `Admin@123`
4. **Click Login**
5. **You'll be redirected to dashboard** as admin!

---

## Default Admin Credentials

- **Email:** `admin@example.com`
- **Password:** `Admin@123`
- **Role:** `admin`

**⚠️ Remember to change the password after first login!**
















