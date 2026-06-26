import { Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  email: string;
  password?: string;
  avatar: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IUserResponse {
  id: string;
  username: string;
  email: string;
  avatar: string;
  createdAt: Date;
}
