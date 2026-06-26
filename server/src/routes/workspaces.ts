import { Router } from 'express';
import { 
  createWorkspace, 
  getWorkspaces, 
  getWorkspaceByRoomId, 
  deleteWorkspace, 
  generateInvite, 
  acceptInvite,
  getWorkspaceVersions,
  getWorkspaceActivities,
  createVersion,
  restoreVersion
} from '../controllers/workspaceController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/', createWorkspace);
router.get('/', getWorkspaces);
router.get('/room/:roomId', getWorkspaceByRoomId);
router.delete('/:id', deleteWorkspace);
router.post('/:id/invite', generateInvite);
router.post('/invite/accept', acceptInvite);
router.get('/:id/versions', getWorkspaceVersions);
router.get('/:id/activities', getWorkspaceActivities);
router.post('/:id/versions', createVersion);
router.post('/:id/versions/:versionId/restore', restoreVersion);

export default router;
