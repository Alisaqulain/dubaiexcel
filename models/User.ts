import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  fullName: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'e1-user';
  isActive: boolean;
  canUpload: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'e1-user'], required: true, default: 'e1-user' },
  isActive: { type: Boolean, default: true, index: true },
  canUpload: { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
});

// Hash password before saving
UserSchema.pre('save', async function() {
  // Only hash if password is modified and it's not already hashed
  if (!this.isModified('passwordHash')) {
    return;
  }
  
  // Check if passwordHash is already hashed (starts with $2a$ or $2b$)
  if (this.passwordHash && (this.passwordHash.startsWith('$2a$') || this.passwordHash.startsWith('$2b$'))) {
    return;
  }
  
  // Hash the password
  if (this.passwordHash) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export default User;

