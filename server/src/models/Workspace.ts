import { Schema, model } from 'mongoose';
import { IWorkspace } from '../types/workspace';

const fileSchema = new Schema({
  path: {
    type: String,
    required: true,
  },
  isFolder: {
    type: Boolean,
    default: false,
  },
  content: {
    type: String,
    default: '',
  },
  language: {
    type: String,
    default: 'plaintext',
  }
});

const workspaceSchema = new Schema<IWorkspace>({
  projectName: {
    type: String,
    required: [true, 'Workspace name is required'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  roomId: {
    type: String,
    required: true,
    unique: true,
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  visibility: {
    type: String,
    enum: ['private', 'public'],
    default: 'public',
  },
  files: [fileSchema]
}, {
  timestamps: true,
});

export const Workspace = model<IWorkspace>('Workspace', workspaceSchema);
