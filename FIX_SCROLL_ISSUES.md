# Fix Scroll and Next.js Issues

## PowerShell Commands (Windows)

### Delete .next folder (Clear Next.js Cache)

**PowerShell:**
```powershell
Remove-Item -Recurse -Force .next
```

**Or if folder doesn't exist:**
```powershell
if (Test-Path .next) { Remove-Item -Recurse -Force .next; Write-Output "Deleted" } else { Write-Output "Folder doesn't exist" }
```

**Command Prompt (CMD):**
```cmd
rmdir /s /q .next
```

---

## Complete Fix Steps

### Step 1: Clear Next.js Cache
```powershell
Remove-Item -Recurse -Force .next
```

### Step 2: Clear Node Modules Cache (Optional)
```powershell
npm cache clean --force
```

### Step 3: Restart Development Server
```powershell
# Stop current server (Ctrl+C)
# Then restart:
npm run dev
```

### Step 4: Hard Refresh Browser
- **Chrome/Edge:** `Ctrl + Shift + R` or `Ctrl + F5`
- **Firefox:** `Ctrl + Shift + R`
- **Safari:** `Cmd + Shift + R`

---

## Scroll Issues - Already Fixed

✅ **Fixed in code:**
- Removed `overflow: hidden` from `globals.css`
- Added `overflow-y: auto` for vertical scrolling
- Added `overflow-x: hidden` to prevent horizontal scroll
- Added scroll classes to dashboard component

**Files updated:**
- `app/globals.css`
- `app/components/ManpowerDashboard.tsx`
- `app/layout.tsx`

---

## "next is not a function" Error

### If error persists after clearing cache:

1. **Check Browser Console:**
   - Press `F12`
   - Go to Console tab
   - Look for exact error message
   - Share the error details

2. **Common Causes:**
   - Build cache issue → Clear `.next` folder
   - Import error → Check all `import` statements
   - Middleware issue → Check middleware files
   - Client/Server component mismatch

3. **Full Reset:**
```powershell
# Delete cache and rebuild
Remove-Item -Recurse -Force .next
Remove-Item -Recurse -Force node_modules\.cache
npm run build
npm run dev
```

---

## Quick Test

After clearing cache and restarting:

1. ✅ **Scroll Test:** Try scrolling with mouse wheel - should work now
2. ✅ **Navigation Test:** Click on menu items - should navigate properly
3. ✅ **Console Check:** Press F12 → Console - should have no errors

---

## Still Having Issues?

If problems persist:

1. **Share Browser Console Error:**
   - Press F12
   - Go to Console tab
   - Copy the exact error message

2. **Check Network Tab:**
   - Press F12 → Network tab
   - Look for failed requests (red)
   - Check which API calls are failing

3. **Verify MongoDB Connection:**
   ```powershell
   npm run test:db
   ```

---

## Summary

✅ **Scroll:** Fixed in CSS
✅ **Cache Clear:** Use PowerShell command above
✅ **Restart:** `npm run dev` after clearing cache

The scroll should work now after refreshing the page!








