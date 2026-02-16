import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IProjectHead extends Document {
  name: string;
  projectName: string;
  password: string;
  role: 'project';
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const ProjectHeadSchema = new Schema<IProjectHead>(
  {
    name: { type: String, required: true, trim: true },
    projectName: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['project'], default: 'project' },
  },
  { timestamps: true }
);

ProjectHeadSchema.index({ projectName: 1 }, { unique: true }); // One ProjectHead per projectName

(ProjectHeadSchema as any).pre('save', async function (this: IProjectHead, next: any) {
  if (!this.isModified('password')) {
    next();
    return;
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

ProjectHeadSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch {
    return false;
  }
};

const ProjectHead =
  mongoose.models.ProjectHead ||
  mongoose.model<IProjectHead>('ProjectHead', ProjectHeadSchema);
export default ProjectHead;
