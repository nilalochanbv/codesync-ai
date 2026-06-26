import { Schema, model, Document, Types } from 'mongoose';

export interface IVersion extends Document {
  workspaceId: Types.ObjectId;
  versionNumber: number;
  user: Types.ObjectId;
  commitMessage: string;
  codeSnapshot: string; // JSON serialized array of files: IFile[]
  createdAt: Date;
}

const versionSchema = new Schema<IVersion>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  versionNumber: {
    type: Number,
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  commitMessage: {
    type: String,
    required: true,
    default: 'Automatic Save',
  },
  codeSnapshot: {
    type: String,
    required: true,
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

// Compound index to ensure version uniqueness per workspace
versionSchema.index({ workspaceId: 1, versionNumber: 1 }, { unique: true });

export const Version = model<IVersion>('Version', versionSchema);
