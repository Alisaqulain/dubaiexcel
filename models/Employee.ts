import mongoose, { Schema, Document } from 'mongoose';

export interface IEmployee extends Document {
  empId: string;
  name: string;
  site: string;
  siteType: 'HEAD_OFFICE' | 'MEP' | 'CIVIL' | 'OTHER' | 'OUTSOURCED' | 'SUPPORT';
  role: string;
  department?: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
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
}, {
  timestamps: true,
});

const Employee = mongoose.models.Employee || mongoose.model<IEmployee>('Employee', EmployeeSchema);
export default Employee;
