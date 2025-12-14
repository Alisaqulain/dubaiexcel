import mongoose, { Schema, Document } from 'mongoose';

export interface IUpload extends Document {
  fileId: string;
  filename: string;
  uploaderId: mongoose.Types.ObjectId;
  parsedRowsCount: number;
  status: 'uploaded' | 'parsing' | 'parsed' | 'merged' | 'error';
  errorMessage?: string;
  uploadedAt: Date;
  processedAt?: Date;
}

const UploadSchema = new Schema<IUpload>({
  fileId: { type: String, required: true, unique: true, index: true },
  filename: { type: String, required: true },
  uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  parsedRowsCount: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['uploaded', 'parsing', 'parsed', 'merged', 'error'], 
    default: 'uploaded' 
  },
  errorMessage: String,
  uploadedAt: { type: Date, default: Date.now },
  processedAt: Date,
}, {
  timestamps: true,
});

const Upload = mongoose.models.Upload || mongoose.model<IUpload>('Upload', UploadSchema);
export default Upload;

