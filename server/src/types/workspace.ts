import { Document, Types } from 'mongoose';

export interface IFile {
  _id?: string;
  path: string;
  isFolder: boolean;
  content: string;
  language: string;
}

export interface IWorkspace extends Document {
  projectName: string;
  description: string;
  roomId: string;
  owner: Types.ObjectId;
  members: Types.ObjectId[];
  visibility: 'private' | 'public';
  files: IFile[];
  createdAt: Date;
  updatedAt: Date;
}
