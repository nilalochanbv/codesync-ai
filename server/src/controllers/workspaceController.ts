import { Response } from 'express';
import { Workspace } from '../models/Workspace';
import { User } from '../models/User';
import { Invite } from '../models/Invite';
import { Version } from '../models/Version';
import { Activity } from '../models/Activity';
import { AuthRequest } from '../middleware/auth';
import crypto from 'crypto';

// Helper to generate a random room ID
const generateRoomId = () => {
  return crypto.randomBytes(6).toString('hex'); // 12-char unique string
};

// Create Workspace
export const createWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { projectName, description, visibility } = req.body;

    if (!projectName) {
      return res.status(400).json({ error: 'Workspace project name is required' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user context' });
    }

    const roomId = generateRoomId();

    const workspace = new Workspace({
      projectName: projectName.trim(),
      description: description?.trim() || '',
      roomId,
      owner: req.user.id,
      members: [req.user.id],
      visibility: visibility || 'public',
      files: []
    });

    await workspace.save();

    // Log Activity
    const activity = new Activity({
      workspaceId: workspace._id,
      user: req.user.id,
      type: 'WORKSPACE_CREATED',
      details: `Workspace '${workspace.projectName}' created`
    });
    await activity.save();

    await workspace.populate('owner', 'username email avatar');

    return res.status(201).json({
      message: 'Workspace created successfully',
      workspace
    });
  } catch (error: any) {
    console.error('Create Workspace Error:', error);
    return res.status(500).json({ error: error.message || 'Error creating workspace' });
  }
};

// Get all Workspaces (Owned or Members)
export const getWorkspaces = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user context' });
    }

    const userId = req.user.id;
    const workspaces = await Workspace.find({
      $or: [
        { owner: userId },
        { members: userId }
      ]
    })
    .populate('owner', 'username email avatar')
    .populate('members', 'username email avatar')
    .sort({ updatedAt: -1 });

    return res.status(200).json({ workspaces });
  } catch (error: any) {
    console.error('Get Workspaces Error:', error);
    return res.status(500).json({ error: error.message || 'Error fetching workspaces' });
  }
};

// Get Workspace details by Room ID
export const getWorkspaceByRoomId = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user context' });
    }

    const workspace = await Workspace.findOne({ roomId })
      .populate('owner', 'username email avatar')
      .populate('members', 'username email avatar');

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Access control
    if (workspace.visibility === 'private') {
      const isOwner = workspace.owner._id.toString() === req.user!.id;
      const isMember = workspace.members.some(m => m._id.toString() === req.user!.id);
      
      if (!isOwner && !isMember) {
        return res.status(403).json({ error: 'Forbidden: Private workspace access denied' });
      }
    }

    return res.status(200).json({ workspace });
  } catch (error: any) {
    console.error('Get Workspace by RoomID Error:', error);
    return res.status(500).json({ error: error.message || 'Error fetching workspace details' });
  }
};

// Delete Workspace
export const deleteWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user context' });
    }

    const workspace = await Workspace.findById(id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    if (workspace.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: Only the workspace owner can delete this' });
    }

    await Workspace.findByIdAndDelete(id);

    // Clean up auxiliary docs
    await Invite.deleteMany({ workspaceId: id });
    await Version.deleteMany({ workspaceId: id });
    await Activity.deleteMany({ workspaceId: id });

    return res.status(200).json({ message: 'Workspace deleted successfully' });
  } catch (error: any) {
    console.error('Delete Workspace Error:', error);
    return res.status(500).json({ error: error.message || 'Error deleting workspace' });
  }
};

// Generate Invite
export const generateInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params; // Workspace document ID
    const { permission, expiry } = req.body; // permission: 'editor' | 'viewer', expiry: 'Never' | '1 Hour' | '24 Hours'

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const workspace = await Workspace.findById(id);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Owner or members can invite
    const isMember = workspace.members.some(m => m.toString() === req.user!.id) || workspace.owner.toString() === req.user.id;
    if (!isMember) {
      return res.status(403).json({ error: 'Forbidden: You do not have permissions to invite users' });
    }

    const code = crypto.randomBytes(16).toString('hex');
    let expiresAt: Date | undefined;

    if (expiry === '1 Hour') {
      expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    } else if (expiry === '24 Hours') {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const invite = new Invite({
      workspaceId: workspace._id,
      roomId: workspace.roomId,
      code,
      permission: permission || 'editor',
      expiresAt,
      createdBy: req.user.id
    });

    await invite.save();

    // Log Activity
    const activity = new Activity({
      workspaceId: workspace._id,
      user: req.user.id,
      type: 'INVITE_GENERATED',
      details: `Invite code generated with ${permission || 'editor'} permissions`
    });
    await activity.save();

    return res.status(201).json({
      message: 'Invite link generated successfully',
      code,
      permission: invite.permission,
      expiresAt: invite.expiresAt
    });
  } catch (error: any) {
    console.error('Generate Invite Error:', error);
    return res.status(500).json({ error: error.message || 'Error generating invite' });
  }
};

// Accept Invite
export const acceptInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user context' });
    }

    const invite = await Invite.findOne({ code });
    if (!invite) {
      return res.status(404).json({ error: 'Invite link is invalid or has expired' });
    }

    // Verify Expiry
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      await Invite.deleteOne({ _id: invite._id });
      return res.status(410).json({ error: 'Invite link has expired' });
    }

    const workspace = await Workspace.findById(invite.workspaceId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace associated with this invite not found' });
    }

    // Add user as member if not already
    const isAlreadyMember = workspace.members.some(m => m.toString() === req.user!.id) || workspace.owner.toString() === req.user.id;
    if (!isAlreadyMember) {
      workspace.members.push(req.user.id as any);
      await workspace.save();

      // Log Activity
      const activity = new Activity({
        workspaceId: workspace._id,
        user: req.user.id,
        type: 'USER_JOINED',
        details: `User joined the workspace via invite link`
      });
      await activity.save();
    }

    return res.status(200).json({
      message: 'Invite accepted successfully',
      roomId: workspace.roomId
    });
  } catch (error: any) {
    console.error('Accept Invite Error:', error);
    return res.status(500).json({ error: error.message || 'Error accepting invite' });
  }
};

// Get Workspace versions history
export const getWorkspaceVersions = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const workspace = await Workspace.findById(id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const versions = await Version.find({ workspaceId: id })
      .populate('user', 'username email avatar')
      .sort({ versionNumber: -1 });

    return res.status(200).json({ versions });
  } catch (error: any) {
    console.error('Get Versions Error:', error);
    return res.status(500).json({ error: error.message || 'Error fetching version history' });
  }
};

// Get Workspace activities logs
export const getWorkspaceActivities = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const activities = await Activity.find({ workspaceId: id })
      .populate('user', 'username email avatar')
      .sort({ createdAt: -1 });

    return res.status(200).json({ activities });
  } catch (error: any) {
    console.error('Get Activities Error:', error);
    return res.status(500).json({ error: error.message || 'Error fetching activity log' });
  }
};

// Create a new Version manual save snapshot
export const createVersion = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { commitMessage } = req.body;

    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const workspace = await Workspace.findById(id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    // Find highest version number
    const lastVersion = await Version.findOne({ workspaceId: id }).sort({ versionNumber: -1 });
    const nextVersionNumber = lastVersion ? lastVersion.versionNumber + 1 : 1;

    const version = new Version({
      workspaceId: id,
      versionNumber: nextVersionNumber,
      user: req.user.id,
      commitMessage: commitMessage || `Save #${nextVersionNumber}`,
      codeSnapshot: JSON.stringify(workspace.files)
    });

    await version.save();

    // Log Activity
    const activity = new Activity({
      workspaceId: id,
      user: req.user.id,
      type: 'CODE_SAVED',
      details: `Saved version #${nextVersionNumber} with message: "${version.commitMessage}"`
    });
    await activity.save();

    return res.status(201).json({
      message: 'Version snapshot saved successfully',
      version
    });
  } catch (error: any) {
    console.error('Create Version Error:', error);
    return res.status(500).json({ error: error.message || 'Error saving version snapshot' });
  }
};

// Restore a Workspace Version
export const restoreVersion = async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;

    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const workspace = await Workspace.findById(id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    const version = await Version.findById(versionId);
    if (!version || version.workspaceId.toString() !== id) {
      return res.status(404).json({ error: 'Version snapshot not found' });
    }

    const restoredFiles = JSON.parse(version.codeSnapshot);
    workspace.files = restoredFiles;
    await workspace.save();

    // Log Activity
    const activity = new Activity({
      workspaceId: id,
      user: req.user.id,
      type: 'VERSION_RESTORED',
      details: `Restored workspace to version #${version.versionNumber}`
    });
    await activity.save();

    return res.status(200).json({
      message: 'Workspace restored successfully',
      files: workspace.files
    });
  } catch (error: any) {
    console.error('Restore Version Error:', error);
    return res.status(500).json({ error: error.message || 'Error restoring version snapshot' });
  }
};
