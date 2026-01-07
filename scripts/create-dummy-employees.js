/**
 * Script to create 5 dummy employees and their user accounts
 * Run with: node scripts/create-dummy-employees.js
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/manpower';

// Employee Schema
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

// User Schema
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'uploader'], required: true, default: 'uploader' },
  name: { type: String },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Dummy employees data
const dummyEmployees = [
  {
    empId: 'EMP001',
    name: 'John Smith',
    site: 'Dubai Office',
    siteType: 'HEAD_OFFICE',
    role: 'Project Manager',
    department: 'Management',
    active: true,
    user: {
      email: 'john.smith@example.com',
      username: 'johnsmith',
      password: 'Password123',
      role: 'uploader',
      name: 'John Smith',
    }
  },
  {
    empId: 'EMP002',
    name: 'Sarah Johnson',
    site: 'MEP Site 1',
    siteType: 'MEP',
    role: 'Site Engineer',
    department: 'Engineering',
    active: true,
    user: {
      email: 'sarah.johnson@example.com',
      username: 'sarahjohnson',
      password: 'Password123',
      role: 'uploader',
      name: 'Sarah Johnson',
    }
  },
  {
    empId: 'EMP003',
    name: 'Ahmed Al-Mansoori',
    site: 'Civil Site 2',
    siteType: 'CIVIL',
    role: 'Foreman',
    department: 'Construction',
    active: true,
    user: {
      email: 'ahmed.almansoori@example.com',
      username: 'ahmedalmansoori',
      password: 'Password123',
      role: 'uploader',
      name: 'Ahmed Al-Mansoori',
    }
  },
  {
    empId: 'EMP004',
    name: 'Maria Garcia',
    site: 'Support Office',
    siteType: 'SUPPORT',
    role: 'HR Coordinator',
    department: 'Human Resources',
    active: true,
    user: {
      email: 'maria.garcia@example.com',
      username: 'mariagarcia',
      password: 'Password123',
      role: 'uploader',
      name: 'Maria Garcia',
    }
  },
  {
    empId: 'EMP005',
    name: 'David Chen',
    site: 'Outsourced Project',
    siteType: 'OUTSOURCED',
    role: 'Quality Inspector',
    department: 'Quality Control',
    active: true,
    user: {
      email: 'david.chen@example.com',
      username: 'davidchen',
      password: 'Password123',
      role: 'uploader',
      name: 'David Chen',
    }
  },
];

async function createDummyEmployees() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    let employeesCreated = 0;
    let employeesSkipped = 0;
    let usersCreated = 0;
    let usersSkipped = 0;

    for (const empData of dummyEmployees) {
      const { user: userData, ...employeeData } = empData;

      // Create or update employee
      try {
        const existingEmployee = await Employee.findOne({ empId: employeeData.empId });
        if (existingEmployee) {
          console.log(`⚠️  Employee ${employeeData.empId} (${employeeData.name}) already exists - skipping`);
          employeesSkipped++;
        } else {
          const employee = await Employee.create(employeeData);
          console.log(`✅ Created employee: ${employeeData.empId} - ${employeeData.name}`);
          employeesCreated++;
        }
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️  Employee ${employeeData.empId} already exists - skipping`);
          employeesSkipped++;
        } else {
          console.error(`❌ Failed to create employee ${employeeData.empId}:`, error.message);
        }
      }

      // Create or update user account
      try {
        const existingUser = await User.findOne({ email: userData.email.toLowerCase() });
        if (existingUser) {
          console.log(`⚠️  User ${userData.email} already exists - skipping`);
          usersSkipped++;
        } else {
          // Hash password manually
          const hashedPassword = await bcrypt.hash(userData.password, 10);
          const user = await User.create({
            email: userData.email.toLowerCase(),
            username: userData.username ? userData.username.toLowerCase() : undefined,
            password: hashedPassword,
            role: userData.role,
            name: userData.name,
            active: true,
          });
          console.log(`✅ Created user account: ${userData.email}`);
          usersCreated++;
        }
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️  User ${userData.email} already exists - skipping`);
          usersSkipped++;
        } else {
          console.error(`❌ Failed to create user ${userData.email}:`, error.message);
        }
      }
      console.log(''); // Empty line for readability
    }

    console.log('\n📊 Summary:');
    console.log(`   Employees created: ${employeesCreated}`);
    console.log(`   Employees skipped: ${employeesSkipped}`);
    console.log(`   Users created: ${usersCreated}`);
    console.log(`   Users skipped: ${usersSkipped}`);

    if (usersCreated > 0) {
      console.log('\n📋 User Credentials:');
      console.log('   All users have the password: Password123');
      console.log('   Please change passwords after first login!\n');
      dummyEmployees.forEach(emp => {
        console.log(`   ${emp.user.email} - ${emp.user.name}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createDummyEmployees();


 * Run with: node scripts/create-dummy-employees.js
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/manpower';

// Employee Schema
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

// User Schema
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'uploader'], required: true, default: 'uploader' },
  name: { type: String },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema);
const User = mongoose.models.User || mongoose.model('User', UserSchema);

// Dummy employees data
const dummyEmployees = [
  {
    empId: 'EMP001',
    name: 'John Smith',
    site: 'Dubai Office',
    siteType: 'HEAD_OFFICE',
    role: 'Project Manager',
    department: 'Management',
    active: true,
    user: {
      email: 'john.smith@example.com',
      username: 'johnsmith',
      password: 'Password123',
      role: 'uploader',
      name: 'John Smith',
    }
  },
  {
    empId: 'EMP002',
    name: 'Sarah Johnson',
    site: 'MEP Site 1',
    siteType: 'MEP',
    role: 'Site Engineer',
    department: 'Engineering',
    active: true,
    user: {
      email: 'sarah.johnson@example.com',
      username: 'sarahjohnson',
      password: 'Password123',
      role: 'uploader',
      name: 'Sarah Johnson',
    }
  },
  {
    empId: 'EMP003',
    name: 'Ahmed Al-Mansoori',
    site: 'Civil Site 2',
    siteType: 'CIVIL',
    role: 'Foreman',
    department: 'Construction',
    active: true,
    user: {
      email: 'ahmed.almansoori@example.com',
      username: 'ahmedalmansoori',
      password: 'Password123',
      role: 'uploader',
      name: 'Ahmed Al-Mansoori',
    }
  },
  {
    empId: 'EMP004',
    name: 'Maria Garcia',
    site: 'Support Office',
    siteType: 'SUPPORT',
    role: 'HR Coordinator',
    department: 'Human Resources',
    active: true,
    user: {
      email: 'maria.garcia@example.com',
      username: 'mariagarcia',
      password: 'Password123',
      role: 'uploader',
      name: 'Maria Garcia',
    }
  },
  {
    empId: 'EMP005',
    name: 'David Chen',
    site: 'Outsourced Project',
    siteType: 'OUTSOURCED',
    role: 'Quality Inspector',
    department: 'Quality Control',
    active: true,
    user: {
      email: 'david.chen@example.com',
      username: 'davidchen',
      password: 'Password123',
      role: 'uploader',
      name: 'David Chen',
    }
  },
];

async function createDummyEmployees() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    let employeesCreated = 0;
    let employeesSkipped = 0;
    let usersCreated = 0;
    let usersSkipped = 0;

    for (const empData of dummyEmployees) {
      const { user: userData, ...employeeData } = empData;

      // Create or update employee
      try {
        const existingEmployee = await Employee.findOne({ empId: employeeData.empId });
        if (existingEmployee) {
          console.log(`⚠️  Employee ${employeeData.empId} (${employeeData.name}) already exists - skipping`);
          employeesSkipped++;
        } else {
          const employee = await Employee.create(employeeData);
          console.log(`✅ Created employee: ${employeeData.empId} - ${employeeData.name}`);
          employeesCreated++;
        }
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️  Employee ${employeeData.empId} already exists - skipping`);
          employeesSkipped++;
        } else {
          console.error(`❌ Failed to create employee ${employeeData.empId}:`, error.message);
        }
      }

      // Create or update user account
      try {
        const existingUser = await User.findOne({ email: userData.email.toLowerCase() });
        if (existingUser) {
          console.log(`⚠️  User ${userData.email} already exists - skipping`);
          usersSkipped++;
        } else {
          // Hash password manually
          const hashedPassword = await bcrypt.hash(userData.password, 10);
          const user = await User.create({
            email: userData.email.toLowerCase(),
            username: userData.username ? userData.username.toLowerCase() : undefined,
            password: hashedPassword,
            role: userData.role,
            name: userData.name,
            active: true,
          });
          console.log(`✅ Created user account: ${userData.email}`);
          usersCreated++;
        }
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️  User ${userData.email} already exists - skipping`);
          usersSkipped++;
        } else {
          console.error(`❌ Failed to create user ${userData.email}:`, error.message);
        }
      }
      console.log(''); // Empty line for readability
    }

    console.log('\n📊 Summary:');
    console.log(`   Employees created: ${employeesCreated}`);
    console.log(`   Employees skipped: ${employeesSkipped}`);
    console.log(`   Users created: ${usersCreated}`);
    console.log(`   Users skipped: ${usersSkipped}`);

    if (usersCreated > 0) {
      console.log('\n📋 User Credentials:');
      console.log('   All users have the password: Password123');
      console.log('   Please change passwords after first login!\n');
      dummyEmployees.forEach(emp => {
        console.log(`   ${emp.user.email} - ${emp.user.name}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createDummyEmployees();

