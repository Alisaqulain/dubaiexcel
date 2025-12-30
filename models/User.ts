import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  username?: string;
  password: string;
  role: 'super-admin' | 'admin' | 'user';
  name?: string;
  active: boolean;
  allottedProjects?: string[]; // Project IDs assigned to this user
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['super-admin', 'admin', 'user'], required: true, default: 'user' },
  name: { type: String },
  active: { type: Boolean, default: true },
  allottedProjects: [{ type: String }], // Array of project IDs
}, {
  timestamps: true,
});

// Hash password before saving
UserSchema.pre('save', async function(next: any) {
  if (!this.isModified('password')) {
    if (next) next();
    return;
  }
  this.password = await bcrypt.hash(this.password, 10);
  if (next) next();
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!candidatePassword) {
    return false;
  }
  // Support both 'password' and 'passwordHash' fields for backward compatibility
  // Use get() to access fields that might not be in the schema
  const hashedPassword = this.password || this.get('passwordHash') || (this as any).passwordHash;
  if (!hashedPassword) {
    console.error('User password field is missing. Available fields:', Object.keys(this.toObject ? this.toObject() : {}));
    return false;
  }
  try {
    return await bcrypt.compare(candidatePassword, hashedPassword);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export default User;

