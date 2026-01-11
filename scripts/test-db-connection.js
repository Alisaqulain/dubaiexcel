/**
 * MongoDB Connection Test Script
 * Tests connection to MongoDB using the MONGODB_URI from .env.local
 * 
 * Run with: node scripts/test-db-connection.js
 * Or: npm run test:db
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGODB_URI) {
  console.error('❌ ERROR: MONGODB_URI not found in environment variables');
  console.error('Please ensure .env.local file exists with MONGODB_URI');
  process.exit(1);
}

console.log('🔍 Testing MongoDB Connection...');
console.log('📍 URI:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')); // Hide password

async function testConnection() {
  try {
    // Set connection options
    const options = {
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout
      socketTimeoutMS: 45000,
    };

    console.log('\n⏳ Connecting to MongoDB...');
    
    // Attempt connection
    await mongoose.connect(MONGODB_URI, options);
    
    console.log('✅ Successfully connected to MongoDB!');
    
    // Test database operations
    console.log('\n🧪 Testing database operations...');
    
    // Get database name
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Database: ${dbName}`);
    
    // List collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`📁 Collections (${collections.length}):`);
    if (collections.length > 0) {
      collections.forEach(col => {
        console.log(`   - ${col.name}`);
      });
    } else {
      console.log('   (No collections found - database is empty)');
    }
    
    // Test a simple query
    try {
      const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
      const userCount = await User.countDocuments();
      console.log(`👥 Users in database: ${userCount}`);
    } catch (err) {
      console.log('👥 Users collection: (not found or error)');
    }
    
    // Get connection info
    const connectionState = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    console.log(`🔌 Connection state: ${states[connectionState]}`);
    
    // Get MongoDB server info
    try {
      const admin = mongoose.connection.db.admin();
      const serverStatus = await admin.serverStatus();
      console.log(`🖥️  MongoDB version: ${serverStatus.version}`);
      console.log(`💾 Uptime: ${Math.floor(serverStatus.uptime / 60)} minutes`);
    } catch (err) {
      console.log('⚠️  Could not fetch server info');
    }
    
    // Close connection
    await mongoose.connection.close();
    console.log('\n✅ Connection test completed successfully!');
    console.log('🎉 MongoDB is ready to use!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Connection failed!');
    console.error('Error details:');
    
    if (error.name === 'MongoServerSelectionError') {
      console.error('   - Could not connect to MongoDB server');
      console.error('   - Check if MongoDB is running');
      console.error('   - Verify network access (firewall, VPN)');
      console.error('   - For MongoDB Atlas: Check IP whitelist');
    } else if (error.name === 'MongoAuthenticationError') {
      console.error('   - Authentication failed');
      console.error('   - Check username and password');
    } else if (error.name === 'MongoParseError') {
      console.error('   - Invalid connection string format');
      console.error('   - Check MONGODB_URI format');
    } else {
      console.error(`   - ${error.name}: ${error.message}`);
    }
    
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Interrupted. Closing connection...');
  await mongoose.connection.close();
  process.exit(0);
});

// Run test
testConnection();




























