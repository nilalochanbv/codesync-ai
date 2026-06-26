import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { User } from '../models/User';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    avatar: string;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token missing or invalid' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded || !decoded.id) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'User associated with this token not found' });
    }

    req.user = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      avatar: user.avatar,
    };
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Server authentication error' });
  }
};
