import { Schema, model, Document, Types } from 'mongoose';

export interface IRoom extends Document {
  workspaceId: Types.ObjectId;
  roomId: string;
  activeUsers: {
    user: Types.ObjectId;
    socketId: string;
    currentFile?: string;
    isTyping?: boolean;
    isIdle?: boolean;
    lastActiveAt: Date;
  }[];
}

const activeUserSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  socketId: {
    type: String,
    required: true,
  },
  currentFile: {
    type: String,
    default: '',
  },
  isTyping: {
    type: Boolean,
    default: false,
  },
  isIdle: {
    type: Boolean,
    default: false,
  },
  lastActiveAt: {
    type: Date,
    default: Date.now,
  }
});

const roomSchema = new Schema<IRoom>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  roomId: {
    type: String,
    required: true,
    unique: true,
  },
  activeUsers: [activeUserSchema]
}, {
  timestamps: true,
});

export const Room = model<IRoom>('Room', roomSchema);
