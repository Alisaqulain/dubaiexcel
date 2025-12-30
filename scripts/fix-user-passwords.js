/**
 * Migration script to fix user passwords
 * Converts passwordHash to password field for existing users
 * Run with: node scripts/fix-user-passwords.js
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/manpower';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String },
  passwordHash: { type: String },
  role: { type: String, enum: ['admin', 'uploader'], default: 'uploader' },
  name: { type: String },
  fullName: { type: String },
  active: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  strict: false, // Allow fields not in schema
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function fixUserPasswords() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all users
    const users = await User.find({}).lean();
    console.log(`\n📋 Found ${users.length} users`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      const updates = {};
      let needsUpdate = false;

      // Fix password field
      if (user.passwordHash && !user.password) {
        updates.password = user.passwordHash;
        needsUpdate = true;
        console.log(`  - Fixing password for: ${user.email}`);
      }

      // Fix name field
      if (user.fullName && !user.name) {
        updates.name = user.fullName;
        needsUpdate = true;
      }

      // Fix active field
      if (user.isActive !== undefined && user.active === undefined) {
        updates.active = user.isActive;
        needsUpdate = true;
      }

      // Fix role field (convert 'e1-user' to 'uploader')
      if (user.role === 'e1-user') {
        updates.role = 'uploader';
        needsUpdate = true;
      }

      if (needsUpdate) {
        await User.updateOne(
          { _id: user._id },
          { $set: updates }
        );
        fixedCount++;
        console.log(`    ✅ Fixed user: ${user.email}`);
      } else {
        skippedCount++;
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Fixed: ${fixedCount} users`);
    console.log(`   Skipped: ${skippedCount} users (already correct)`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error fixing user passwords:', error);
    process.exit(1);
  }
}

fixUserPasswords();

