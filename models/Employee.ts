import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IEmployee extends Document {
  empId: string;
  name: string;
  site: string;
  siteType: 'HEAD_OFFICE' | 'MEP' | 'CIVIL' | 'OTHER' | 'OUTSOURCED' | 'SUPPORT';
  role: string;
  department?: string;
  active: boolean;
  labourType: 'OUR_LABOUR' | 'SUPPLY_LABOUR' | 'SUBCONTRACTOR';
  password?: string; // Hashed password for employee login
  projectId?: string; // Project this employee belongs to
  uploadedBy?: mongoose.Types.ObjectId; // User who uploaded this employee
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const EmployeeSchema = new Schema<IEmployee>({
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
  labourType: { 
    type: String, 
    enum: ['OUR_LABOUR', 'SUPPLY_LABOUR', 'SUBCONTRACTOR'],
    default: 'OUR_LABOUR',
    required: true 
  },
  password: { type: String, select: false }, // Hashed password, not selected by default
  projectId: { type: String, index: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// Hash password before saving
EmployeeSchema.pre('save', async function() {
  try {
    // If password is not modified or doesn't exist, skip hashing
    if (!this.isModified('password') || !this.password) {
      return;
    }

    // Only hash if password is a plain string (not already hashed)
    // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
    if (typeof this.password === 'string' && this.password.startsWith('$2')) {
      // Password is already hashed, skip
      return;
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(String(this.password), salt);
  } catch (error) {
    // If there's an error, throw it so Mongoose can handle it
    throw error;
  }
});

// Method to compare password
EmployeeSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password || !candidatePassword) {
    return false;
  }
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    return false;
  }
};

const Employee = mongoose.models.Employee || mongoose.model<IEmployee>('Employee', EmployeeSchema);
export default Employee;
