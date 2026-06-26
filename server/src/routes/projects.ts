import { Router } from 'express';
import { createProject, getProjects, getProjectById, deleteProject, inviteCollaborator } from '../controllers/projectController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Secure all project endpoints with auth middleware
router.use(authenticate as any);

router.post('/', createProject as any);
router.get('/', getProjects as any);
router.get('/:id', getProjectById as any);
router.delete('/:id', deleteProject as any);
router.post('/:id/invite', inviteCollaborator as any);

export default router;
