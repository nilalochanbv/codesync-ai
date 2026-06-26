import { Request, Response } from 'express';
import { User } from '../models/User';
import { generateToken } from '../utils/auth';
import { AuthRequest } from '../middleware/auth';
import { OAuth2Client } from 'google-auth-library';

// Register User
export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // Basic Validations
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields (username, email, password) are required' });
    }

    // Check if user already exists
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ error: 'Email address already registered' });
    }

    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Generate a beautiful, unique robot avatar based on username
    const avatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(username)}`;

    // Create user
    const user = new User({
      username,
      email,
      password,
      avatar,
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id.toString());

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      }
    });
  } catch (error: any) {
    console.error('Registration Error:', error);
    return res.status(500).json({ error: error.message || 'Error creating user account' });
  }
};

// Login User
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find User
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Match Password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate Token
    const token = generateToken(user._id.toString());

    return res.status(200).json({
      message: 'Logged in successfully',
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      }
    });
  } catch (error: any) {
    console.error('Login Error:', error);
    return res.status(500).json({ error: error.message || 'Error logging in' });
  }
};

// Get Current User Profile
export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized access' });
    }
    
    // User is already attached by authenticate middleware
    return res.status(200).json({
      user: req.user
    });
  } catch (error: any) {
    console.error('Get Profile Error:', error);
    return res.status(500).json({ error: error.message || 'Error getting profile data' });
  }
};

// Google Mock Sign In
export const googleMockLogin = async (req: Request, res: Response) => {
  try {
    const { username, email, avatar } = req.body;

    if (!email || !username) {
      return res.status(400).json({ error: 'Username and email are required for Google authentication' });
    }

    // Check if user exists
    let user = await User.findOne({ email });

    if (!user) {
      // Create user if not exists with a random password
      const randomPassword = Math.random().toString(36).substring(2, 15);
      user = new User({
        username: username.replace(/\s+/g, '').toLowerCase() + Math.floor(Math.random() * 100),
        email,
        password: randomPassword,
        avatar: avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(username)}`,
      });
      await user.save();
    }

    const token = generateToken(user._id.toString());

    return res.status(200).json({
      message: 'Authenticated with Google successfully',
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      }
    });
  } catch (error: any) {
    console.error('Google Auth Error:', error);
    return res.status(500).json({ error: error.message || 'Error authenticating with Google' });
  }
};

// Real Google OAuth Sign In
export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      return res.status(500).json({ error: 'Google Client ID is not configured on the server.' });
    }

    if (!idToken) {
      return res.status(400).json({ error: 'Google ID Token is required' });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({ error: 'Invalid Google ID Token' });
    }

    const { email, name, picture } = payload;
    if (!email || !name) {
      return res.status(400).json({ error: 'Profile name and email are required' });
    }

    // Find or create User
    let user = await User.findOne({ email });

    if (!user) {
      // Create user if not exists with a random password
      const randomPassword = Math.random().toString(36).substring(2, 15);
      user = new User({
        username: name.replace(/\s+/g, '').toLowerCase() + Math.floor(Math.random() * 100),
        email,
        password: randomPassword,
        avatar: picture || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
      });
      await user.save();
    }

    const token = generateToken(user._id.toString());

    return res.status(200).json({
      message: 'Authenticated with Google successfully',
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      }
    });
  } catch (error: any) {
    console.error('Real Google Auth Error:', error);
    return res.status(500).json({ error: error.message || 'Error authenticating with Google' });
  }
};
