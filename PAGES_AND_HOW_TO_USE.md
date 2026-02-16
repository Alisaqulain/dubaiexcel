# ExelPro – Page URLs and How to Use Everything

## 1. Page URLs (all routes)

| URL | Who can access | What it does |
|-----|----------------|---------------|
| `/` | Anyone | Redirects: logged in → `/dashboard`, else → `/login` |
| `/login` | Anyone | Login or register. Login types: Email, Username, Employee ID, **Project / Site** |
| `/dashboard` | All logged-in users | Main dashboard. Admins see Manpower dashboard; employees see their reports |
| **Admin / Super-admin only** | | |
| `/admin/format-view` | Admin, Super-admin | Pick an Excel format and view it |
| `/admin/summary-report` | Super-admin only | Summary report |
| `/admin/created-excel-files` | Admin, Super-admin | List of created Excel files. View file, set login column & site logins, **worker transfer** (dropdown per row) |
| `/admin/upload` | Admin, Super-admin, User | Upload Excel (create a file from a format) |
| `/admin/employees` | Admin, Super-admin | Manage users (employees) |
| `/admin/excel-employees` | Admin, Super-admin | Excel employees |
| `/admin/excel-formats` | Admin, Super-admin | Create/edit Excel formats and **template data** (rows) |
| `/admin/site-management` | Admin, Super-admin | Manage project/site logins: add/delete site, change password (single or bulk) |
| `/admin/excel-merge` | Admin, Super-admin | Merge Excel files |
| `/admin/logs` | Admin, Super-admin | Activity logs |
| `/admin/clear-data` | Super-admin only | Clear data |
| `/reports/download-excel` | Admin, Super-admin | Download Excel reports |
| **Employee (user role)** | | |
| (same `/admin/upload`, `/dashboard`) | User | Upload Excel, My Reports |

---

## 2. How to do everything (step by step)

### A. Login

- Open: **`/login`**
- Choose how to log in:
  - **Email** – email + password
  - **Username** – username + password
  - **Employee ID** – Employee ID (e.g. EMP008) + password
  - **Project / Site** – select **File — Site** from dropdown, then password (default `Password@1234`)
- After login you go to **`/dashboard`**.

---

### B. One flow: Excel Format → Template data → Created Excel file

1. **Create/define Excel format (admin)**  
   - Go to **`/admin/excel-formats`**  
   - Create or edit a format (columns, validation, etc.).  
   - Optionally set **login column** (e.g. “PROJECT NAME”) for site-based login.

2. **Add template data (rows)**  
   - On the same **Excel Formats** page, open a format and add/save **template data** (rows).  
   - This is the “master” row data for that format. No separate “Sheets Upload” anymore.

3. **Create an Excel file from the format**  
   - **Option 1 – Employee:**  
     - Log in as **Employee** (Employee ID + password).  
     - Go to **Upload** (`/admin/upload`), choose format, generate/download the Excel file. That creates a **Created Excel File** linked to the format.  
   - **Option 2 – Admin:**  
     - Use **Created Excel Files** or upload flow so that a file exists for that format.

4. **Set login column and site logins (so site users can log in)**  
   - Go to **`/admin/created-excel-files`**.  
   - Click **View** on the file.  
   - Open **“Login column & site logins”**:  
     - Choose the **login column** (e.g. PROJECT NAME).  
     - Click **“Load unique values”** to fill sites from the file.  
     - Add/remove sites, set passwords (default `Password@1234`).  
     - Click **“Save site logins”**.  
   - Now that file’s sites appear in the **Project / Site** login dropdown.

---

### C. Site / Project Management (passwords, add/delete sites)

- Go to **`/admin/site-management`**.  
- **Select file** from the dropdown (lists created Excel files).  
- You see the **login column** and list of **sites** for that file.  
- You can:  
  - **Add site** – type name, click “Add site”, then **“Save all sites”**.  
  - **Delete** – delete a site from the table, then **“Save all sites”**.  
  - **Change password** – for one site, click “Change password”, enter new password, Save.  
  - **Reset all passwords** – enter new password in “Bulk password”, click “Reset all passwords”.  

If the file has no login column yet, set it first in **Created Excel Files → View file → Login column & site logins** (see B.4).

---

### D. Project / Site login (site head sees only their rows)

1. On **`/login`**, choose **“Project / Site”**.  
2. Select **File — Site** from the dropdown (e.g. “MyFile.xlsx — Site A”).  
3. Enter password (default `Password@1234` unless changed in Site Management).  
4. After login, go to **`/dashboard`** – the site user sees only rows where the **login column** matches their site (or merged group).

---

### E. Worker transfer (move a worker to another site)

1. Go to **`/admin/created-excel-files`**.  
2. Click **View** on the file that has the worker rows.  
3. Make sure **“Login column & site logins”** is set for that file (so the login column is known and sites exist).  
4. In the **data table**, the **login column** is shown as a **dropdown** in each row.  
5. Change the dropdown for a row to another site → that row is updated in the Excel file (worker “moved” to that site).  
6. The file is saved automatically; site users will see the updated assignment when they log in.

---

## 3. Quick reference – “I want to…”

| I want to… | Page / step |
|------------|-------------|
| Log in as admin | `/login` → Email or Username + password |
| Log in as employee | `/login` → Employee ID + password |
| Log in as site/project | `/login` → Project / Site → choose file — site → password |
| Define Excel structure and template rows | `/admin/excel-formats` |
| Create an Excel file (employee) | Log in as employee → `/admin/upload` → choose format → create file |
| Set which column is “site” and who can log in | `/admin/created-excel-files` → View file → “Login column & site logins” → set column, load values, Save |
| Add/delete sites, change one or all passwords | `/admin/site-management` → select file → add/delete/change password / bulk reset |
| Move a worker to another site | `/admin/created-excel-files` → View file → change the **login column dropdown** for that row |
| See all created files | `/admin/created-excel-files` |
| Merge files | `/admin/excel-merge` |
| See activity | `/admin/logs` |

---

## 4. Default site password

- New sites use password: **`Password@1234`** (unless you set another in Site Management or in the Login column panel).
