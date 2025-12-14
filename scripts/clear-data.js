/**
 * Script to clear all static data from the database
 * 
 * Usage: node scripts/clear-data.js
 * 
 * WARNING: This will delete:
 * - All attendance records (AttendanceMaster)
 * - All raw attendance data (AttendanceRaw)
 * - All employees
 * - All upload records
 * - All upload logs
 * 
 * Users and Roles will be preserved.
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local');
  process.exit(1);
}

async function clearData() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collections = {
      attendancemaster: 'AttendanceMaster',
      attendanceraw: 'AttendanceRaw',
      employees: 'Employee',
      uploads: 'Upload',
      uploadlogs: 'UploadLog',
    };

    const results = {};

    console.log('🗑️  Starting data deletion...\n');

    for (const [key, collectionName] of Object.entries(collections)) {
      try {
        const collection = db.collection(collectionName.toLowerCase() + 's');
        const count = await collection.countDocuments();
        const result = await collection.deleteMany({});
        results[key] = result.deletedCount || 0;
        console.log(`✅ ${collectionName}: Deleted ${results[key]} records (found ${count})`);
      } catch (error) {
        console.error(`❌ Error deleting ${collectionName}:`, error.message);
        results[key] = 0;
      }
    }

    const totalDeleted = Object.values(results).reduce((sum, count) => sum + count, 0);

    console.log('\n📊 Summary:');
    console.log(`   AttendanceMaster: ${results.attendancemaster}`);
    console.log(`   AttendanceRaw: ${results.attendanceraw}`);
    console.log(`   Employees: ${results.employees}`);
    console.log(`   Uploads: ${results.uploads}`);
    console.log(`   UploadLogs: ${results.uploadlogs}`);
    console.log(`\n   Total deleted: ${totalDeleted} records`);

    console.log('\n✅ Data cleared successfully!');
    console.log('ℹ️  Users and Roles have been preserved.');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the script
clearData();


