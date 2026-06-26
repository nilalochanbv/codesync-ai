import { Router } from 'express';
import { executeCode } from '../controllers/executionController';

const router = Router();

// Route to run/execute code
router.post('/', executeCode as any);

export default router;
