import { Schema, model, Document, Types } from 'mongoose';

export interface IActivity extends Document {
  workspaceId: Types.ObjectId;
  user: Types.ObjectId;
  type: 'WORKSPACE_CREATED' | 'FILE_CREATED' | 'FOLDER_CREATED' | 'FILE_DELETED' | 'FILE_RENAMED' | 'CODE_SAVED' | 'VERSION_RESTORED' | 'INVITE_GENERATED' | 'USER_JOINED' | 'USER_LEFT' | 'MESSAGE_SENT';
  details: string;
  createdAt: Date;
}

const activitySchema = new Schema<IActivity>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'WORKSPACE_CREATED', 'FILE_CREATED', 'FOLDER_CREATED', 'FILE_DELETED', 
      'FILE_RENAMED', 'CODE_SAVED', 'VERSION_RESTORED', 'INVITE_GENERATED', 
      'USER_JOINED', 'USER_LEFT', 'MESSAGE_SENT'
    ],
    required: true,
  },
  details: {
    type: String,
    default: '',
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

export const Activity = model<IActivity>('Activity', activitySchema);
