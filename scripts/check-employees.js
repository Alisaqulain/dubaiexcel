/**
 * Quick script to check if employees exist in database
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/manpower';

const EmployeeSchema = new mongoose.Schema({
  empId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  site: { type: String, required: true },
  siteType: { 
    type: String, 
    enum: ['HEAD_OFFICE', 'MEP', 'CIVIL', 'OTHER', 'OUTSOURCED', 'SUPPORT'],
    required: true 
  },
  role: { type: String, required: true },
  department: { type: String },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);

async function checkEmployees() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const employees = await Employee.find().lean();
    console.log(`📊 Total employees in database: ${employees.length}\n`);

    if (employees.length === 0) {
      console.log('⚠️  No employees found in database!');
    } else {
      console.log('📋 Employees:');
      employees.forEach((emp, index) => {
        console.log(`\n${index + 1}. Employee ID: ${emp.empId}`);
        console.log(`   Name: ${emp.name}`);
        console.log(`   Site: ${emp.site}`);
        console.log(`   Site Type: ${emp.siteType}`);
        console.log(`   Role: ${emp.role}`);
        console.log(`   Active: ${emp.active}`);
      });
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkEmployees();

