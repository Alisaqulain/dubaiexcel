# MongoDB Setup Guide

## Option 1: MongoDB Atlas (Recommended - Cloud Database)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. Create a free account
3. Create a new cluster (free tier available)
4. Create a database user:
   - Go to "Database Access" → "Add New Database User"
   - Choose "Password" authentication
   - Save the username and password
5. Whitelist your IP:
   - Go to "Network Access" → "Add IP Address"
   - Click "Allow Access from Anywhere" (for development) or add your IP
6. Get your connection string:
   - Go to "Clusters" → "Connect" → "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password
   - Replace `<dbname>` with `excelpro` or your preferred database name

7. Create `.env.local` file in the root directory:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/excelpro?retryWrites=true&w=majority
```

## Option 2: Local MongoDB Installation

### Windows Installation:

1. Download MongoDB Community Server:
   - Visit: https://www.mongodb.com/try/download/community
   - Select Windows version
   - Download and run the installer

2. Install MongoDB:
   - Run the installer
   - Choose "Complete" installation
   - Install as a Windows Service (recommended)
   - Install MongoDB Compass (optional GUI tool)

3. Start MongoDB Service:
   ```powershell
   # Check if service exists
   Get-Service -Name MongoDB
   
   # Start the service
   Start-Service -Name MongoDB
   
   # Or start manually
   mongod --dbpath "C:\data\db"
   ```

4. Create `.env.local` file:
```env
MONGODB_URI=mongodb://localhost:27017/excelpro
```

### Verify MongoDB is Running:

```powershell
# Check service status
Get-Service -Name MongoDB

# Or test connection
mongosh
```

## Quick Start (Using MongoDB Atlas)

1. Sign up at MongoDB Atlas (free tier)
2. Create a cluster
3. Get your connection string
4. Create `.env.local` file with your connection string
5. Restart your Next.js dev server

## Troubleshooting

- **Connection refused**: MongoDB service is not running
- **Authentication failed**: Check username/password in connection string
- **Network access denied**: Add your IP to MongoDB Atlas whitelist


