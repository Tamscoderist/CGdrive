# IAS102 - Information Assurance and Security 2

Web application with **Authentication** (password + MFA/OTP) and **Authorization** (RBAC + DAC simulation).

## Tech stack

- **Frontend:** React.js + Vite
- **Backend:** Node.js + Express
- **Database:** SQLite

## Features

### 4.1 Authentication
- **A. Password-based:** Username/password login with validation.
- **B. MFA:** After password validation, system generates a 6-digit OTP. User must enter OTP before accessing the system. OTP is simulated (returned in API response for demo).

### 4.2 Authorization
- **A. RBAC:** Roles Admin, Staff, User. Dashboard content and access depend on role.
  - **Admin:** Full system access, can see all files.
  - **Staff:** Limited management; own files only.
  - **User:** Basic access; own files only.
- **B. DAC:** Files stored in DB with an owner. Only the owner can access a file; others get "Access denied."

## How to run

1. **Install dependencies**
   ```bash
   npm run install:all
   ```
   Or manually:
   ```bash
   npm install
   cd client && npm install
   cd ../server && npm install
   ```

2. **Start backend and frontend**
   ```bash
   npm run dev
   ```
   - Backend: http://localhost:3001  
   - Frontend: http://localhost:5173  

   Or run separately:
   ```bash
   npm run server   # terminal 1
   npm run client   # terminal 2
   ```

3. **Admin (seeded)**  
   - admin123 / admin123  

4. **Flow**
   - **Register:** Username + password only (no role). New users get default role "user".
   - **Admin assigns roles:** Login as admin123 → Manage Users → Change user to Staff or User.
   - **Login** (username/password) → Enter OTP (simulated) → Role-based dashboard → My Files (DAC).

## Database

- **users:** id, username, password, role, otp, otp_expires  
- **files:** id, filename, owner_id  

SQLite file: `server/database.sqlite` (created on first run).

## Deliverables

- Source code (this folder)
- Database: `server/database.sqlite` or export schema from `server/db.js`
- System architecture diagram and technical report: to be added separately.
