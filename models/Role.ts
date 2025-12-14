import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
  name: string;
  allowedStatuses: string[];
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const RoleSchema = new Schema<IRole>({
  name: { type: String, required: true, unique: true, uppercase: true },
  allowedStatuses: { type: [String], required: true, default: ['Present', 'Absent', 'Leave'] },
  description: { type: String },
}, {
  timestamps: true,
});

const Role = mongoose.models.Role || mongoose.model<IRole>('Role', RoleSchema);
export default Role;

