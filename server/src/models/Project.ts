import { Schema, model } from 'mongoose';
import { IProject } from '../types/project';

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

const projectSchema = new Schema<IProject>({
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  collaborators: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  files: [fileSchema]
}, {
  timestamps: true,
});

export const Project = model<IProject>('Project', projectSchema);
