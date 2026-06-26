import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import workspaceRoutes from './routes/workspaces';
import executeRoutes from './routes/execute';
import { setupEditorSockets } from './socket/editorSocket';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/codesync';

// Middleware
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}));
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', workspaceRoutes);
app.use('/api/execute', executeRoutes);

// Basic health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'CodeSync AI backend is running smoothly' });
});

// Configure Socket.IO
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Initialize real-time collaborative sockets
setupEditorSockets(io);

// Connect to MongoDB & Start Server
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('📝 Connected to MongoDB successfully.');
    server.listen(PORT, () => {
      console.log(`🚀 CodeSync Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    // Start server even if MongoDB is not running, so setup isn't blocked
    server.listen(PORT, () => {
      console.log(`🚀 CodeSync Server listening on http://localhost:${PORT} (without Database connection)`);
    });
  });
