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
EmployeeSchema.pre('save', async function(next: any) {
  if (!this.isModified('password') || !this.password) {
    if (next) next();
    return;
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    if (next) next();
  } catch (error: any) {
    if (next) next(error);
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
