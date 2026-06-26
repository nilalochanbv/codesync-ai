import { Schema, model, Document, Types } from 'mongoose';

export interface IInvite extends Document {
  workspaceId: Types.ObjectId;
  roomId: string;
  code: string;
  permission: 'editor' | 'viewer';
  expiresAt?: Date; // Undefined/null = Never
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const inviteSchema = new Schema<IInvite>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  roomId: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
  },
  permission: {
    type: String,
    enum: ['editor', 'viewer'],
    default: 'editor',
  },
  expiresAt: {
    type: Date,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

export const Invite = model<IInvite>('Invite', inviteSchema);
