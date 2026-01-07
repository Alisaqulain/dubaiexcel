/**
 * Seed script to create initial admin user
 * Run with: node scripts/seed-admin.js
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/manpower';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['super-admin', 'admin', 'user'], required: true, default: 'user' },
  name: { type: String },
  username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

// Note: We'll hash passwords manually in the seed script

const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function seedAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Create Super Admin
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@example.com';
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@123';
    const superAdminName = process.env.SUPER_ADMIN_NAME || 'Super Admin';
    const superAdminUsername = process.env.SUPER_ADMIN_USERNAME || 'superadmin';

    // Create Admin
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const adminName = process.env.ADMIN_NAME || 'System Admin';
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';

    // Check and create Super Admin
    let existingSuperAdmin = await User.findOne({ email: superAdminEmail });
    if (existingSuperAdmin) {
      console.log(`\n⚠️  Super Admin user already exists: ${superAdminEmail}`);
      console.log(`   Current role: ${existingSuperAdmin.role}`);
    } else {
      const hashedSuperPassword = await bcrypt.hash(superAdminPassword, 10);
      await User.create({
        email: superAdminEmail,
        password: hashedSuperPassword,
        role: 'super-admin',
        name: superAdminName,
        username: superAdminUsername,
        active: true,
      });
      console.log('\n✅ Super Admin user created successfully!');
      console.log('\n📋 Super Admin Credentials:');
      console.log('   Email:', superAdminEmail);
      console.log('   Username:', superAdminUsername);
      console.log('   Password:', superAdminPassword);
      console.log('   Full Name:', superAdminName);
      console.log('   Role: super-admin');
    }

    // Check and create Admin
    let existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log(`\n⚠️  Admin user already exists: ${adminEmail}`);
      console.log(`   Current role: ${existingAdmin.role}`);
    } else {
      const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
      await User.create({
      email: adminEmail,
        password: hashedAdminPassword,
      role: 'admin',
        name: adminName,
        username: adminUsername,
        active: true,
    });
    console.log('\n✅ Admin user created successfully!');
    console.log('\n📋 Admin Credentials:');
    console.log('   Email:', adminEmail);
      console.log('   Username:', adminUsername);
    console.log('   Password:', adminPassword);
    console.log('   Full Name:', adminName);
    console.log('   Role: admin');
    }

    console.log('\n⚠️  IMPORTANT: Please change the password after first login!');
    console.log('\n🔗 Login at: http://localhost:3000/login');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();


    let existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log(`\n⚠️  Admin user already exists: ${adminEmail}`);
      console.log(`   Current role: ${existingAdmin.role}`);
    } else {
      const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
      await User.create({
      email: adminEmail,
        password: hashedAdminPassword,
      role: 'admin',
        name: adminName,
        username: adminUsername,
        active: true,
    });
    console.log('\n✅ Admin user created successfully!');
    console.log('\n📋 Admin Credentials:');
    console.log('   Email:', adminEmail);
      console.log('   Username:', adminUsername);
    console.log('   Password:', adminPassword);
    console.log('   Full Name:', adminName);
    console.log('   Role: admin');
    }

    console.log('\n⚠️  IMPORTANT: Please change the password after first login!');
    console.log('\n🔗 Login at: http://localhost:3000/login');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
}

seedAdmin();

