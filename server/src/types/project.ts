import { Document, Types } from 'mongoose';

export interface IFile {
  _id?: string;
  path: string;
  isFolder: boolean;
  content: string;
  language: string;
}

export interface IProject extends Document {
  name: string;
  description: string;
  owner: Types.ObjectId;
  collaborators: Types.ObjectId[];
  files: IFile[];
  createdAt: Date;
  updatedAt: Date;
}
