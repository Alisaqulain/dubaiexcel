/**
 * Seed script to create initial admin user
 * Run with: node scripts/seed-admin.js
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/manpower';

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'e1-user'], required: true, default: 'e1-user' },
  isActive: { type: Boolean, default: true, index: true },
  canUpload: { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function seedAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';
    const adminName = process.env.ADMIN_NAME || 'System Admin';

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log(`\n⚠️  Admin user already exists: ${adminEmail}`);
      console.log('   To reset password, use the admin panel or delete the user first.');
      console.log(`   Current role: ${existingAdmin.role}`);
      await mongoose.disconnect();
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create admin user
    const admin = await User.create({
      fullName: adminName,
      email: adminEmail,
      passwordHash: hashedPassword,
      role: 'admin',
      isActive: true,
      canUpload: true,
    });

    console.log('\n✅ Admin user created successfully!');
    console.log('\n📋 Admin Credentials:');
    console.log('   Email:', adminEmail);
    console.log('   Password:', adminPassword);
    console.log('   Full Name:', adminName);
    console.log('   Role: admin');
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

