import { Schema, model, Document, Types } from 'mongoose';

export interface IMessage extends Document {
  workspaceId: Types.ObjectId;
  roomId: string;
  sender: Types.ObjectId;
  text: string;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  roomId: {
    type: String,
    required: true,
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    required: true,
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

export const Message = model<IMessage>('Message', messageSchema);
