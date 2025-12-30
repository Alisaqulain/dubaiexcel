/**
 * Script to add usernames to existing users
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/manpower';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'uploader'], required: true, default: 'uploader' },
  name: { type: String },
  active: { type: Boolean, default: true },
}, {
  timestamps: true,
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

const usernameMap = {
  'john.smith@example.com': 'johnsmith',
  'sarah.johnson@example.com': 'sarahjohnson',
  'ahmed.almansoori@example.com': 'ahmedalmansoori',
  'maria.garcia@example.com': 'mariagarcia',
  'david.chen@example.com': 'davidchen',
  'admin@example.com': 'admin',
};

async function addUsernames() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const users = await User.find({}).lean();
    console.log(`📊 Found ${users.length} users\n`);

    let updated = 0;
    let skipped = 0;

    for (const user of users) {
      const email = user.email;
      const username = usernameMap[email] || email.split('@')[0].replace(/[^a-z0-9]/g, '');

      if (user.username) {
        console.log(`⚠️  User ${email} already has username: ${user.username} - skipping`);
        skipped++;
        continue;
      }

      try {
        await User.updateOne(
          { _id: user._id },
          { $set: { username: username.toLowerCase() } }
        );
        console.log(`✅ Added username "${username}" to ${email}`);
        updated++;
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️  Username "${username}" already taken for ${email} - trying alternative`);
          // Try with email prefix
          const altUsername = email.split('@')[0] + user._id.toString().slice(-4);
          try {
            await User.updateOne(
              { _id: user._id },
              { $set: { username: altUsername.toLowerCase() } }
            );
            console.log(`✅ Added username "${altUsername}" to ${email}`);
            updated++;
          } catch (err) {
            console.error(`❌ Failed to add username to ${email}:`, err.message);
          }
        } else {
          console.error(`❌ Failed to add username to ${email}:`, error.message);
        }
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated} users`);
    console.log(`   Skipped: ${skipped} users`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addUsernames();

