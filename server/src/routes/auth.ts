import { Router } from 'express';
import { register, login, getMe, googleMockLogin, googleLogin } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/google-mock', googleMockLogin);
router.post('/google', googleLogin);

// Protected routes
router.get('/me', authenticate as any, getMe as any);

export default router;
