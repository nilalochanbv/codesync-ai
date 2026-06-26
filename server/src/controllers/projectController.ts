import { Response } from 'express';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/auth';

// Helper to determine initial filename and template
const getInitialTemplate = (language: string) => {
  switch (language.toLowerCase()) {
    case 'python':
      return { name: 'main.py', content: '# Welcome to CodeSync AI!\n\ndef greet():\n    print("Hello from CodeSync AI!")\n\ngreet()\n' };
    case 'javascript':
      return { name: 'index.js', content: '// Welcome to CodeSync AI!\n\nfunction greet() {\n  console.log("Hello from CodeSync AI!");\n}\n\ngreet();\n' };
    case 'java':
      return { name: 'Main.java', content: '// Welcome to CodeSync AI!\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from CodeSync AI!");\n    }\n}\n' };
    case 'cpp':
    case 'c++':
      return { name: 'main.cpp', content: '// Welcome to CodeSync AI!\n#include <iostream>\n\nint main() {\n    std::cout << "Hello from CodeSync AI!" << std::endl;\n    return 0;\n}\n' };
    case 'c':
      return { name: 'main.c', content: '// Welcome to CodeSync AI!\n#include <stdio.h>\n\nint main() {\n    printf("Hello from CodeSync AI!\\n");\n    return 0;\n}\n' };
    case 'go':
      return { name: 'main.go', content: '// Welcome to CodeSync AI!\npackage main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from CodeSync AI!")\n}\n' };
    case 'rust':
      return { name: 'main.rs', content: '// Welcome to CodeSync AI!\nfn main() {\n    println!("Hello from CodeSync AI!");\n}\n' };
    case 'kotlin':
      return { name: 'Main.kt', content: '// Welcome to CodeSync AI!\nfun main() {\n    println("Hello from CodeSync AI!")\n}\n' };
    default:
      return { name: 'script.txt', content: 'Welcome to CodeSync AI!' };
  }
};

// Create a new Project
export const createProject = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, language } = req.body;

    if (!name || !language) {
      return res.status(400).json({ error: 'Project name and language are required' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user context' });
    }

    const project = new Project({
      name,
      description,
      owner: req.user.id,
      collaborators: [],
      files: []
    });

    await project.save();

    // Populate owner
    await project.populate('owner', 'username email avatar');

    return res.status(201).json({
      message: 'Project created successfully',
      project
    });
  } catch (error: any) {
    console.error('Create Project Error:', error);
    return res.status(500).json({ error: error.message || 'Error creating project' });
  }
};

// Get all Projects (Owned or Collaborator)
export const getProjects = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user context' });
    }

    const userId = req.user.id;
    const projects = await Project.find({
      $or: [
        { owner: userId },
        { collaborators: userId }
      ]
    })
    .populate('owner', 'username email avatar')
    .populate('collaborators', 'username email avatar')
    .sort({ updatedAt: -1 });

    return res.status(200).json({ projects });
  } catch (error: any) {
    console.error('Get Projects Error:', error);
    return res.status(500).json({ error: error.message || 'Error fetching projects' });
  }
};

// Get Project by ID
export const getProjectById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user context' });
    }

    const project = await Project.findById(id)
      .populate('owner', 'username email avatar')
      .populate('collaborators', 'username email avatar');

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const userId = req.user.id;
    const isOwner = project.owner._id.toString() === userId;
    const isCollaborator = project.collaborators.some(collab => collab._id.toString() === userId);

    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ error: 'Forbidden: You do not have access to this project' });
    }

    return res.status(200).json({ project });
  } catch (error: any) {
    console.error('Get Project ID Error:', error);
    return res.status(500).json({ error: error.message || 'Error fetching project details' });
  }
};

// Delete Project
export const deleteProject = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user context' });
    }

    const project = await Project.findById(id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: Only the project owner can delete this project' });
    }

    await Project.findByIdAndDelete(id);

    return res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error: any) {
    console.error('Delete Project Error:', error);
    return res.status(500).json({ error: error.message || 'Error deleting project' });
  }
};

// Invite collaborator by email or username
export const inviteCollaborator = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { invitee } = req.body; // Can be email or username

    if (!invitee) {
      return res.status(400).json({ error: 'Collaborator email or username is required' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized user context' });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Only owner can invite
    if (project.owner.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: Only the owner can invite collaborators' });
    }

    // Find the user to invite
    const userToInvite = await User.findOne({
      $or: [
        { email: invitee.toLowerCase().trim() },
        { username: invitee.trim() }
      ]
    });

    if (!userToInvite) {
      return res.status(404).json({ error: 'User not found' });
    }

    const inviteeIdStr = userToInvite._id.toString();

    // Check if user is owner
    if (project.owner.toString() === inviteeIdStr) {
      return res.status(400).json({ error: 'User is already the project owner' });
    }

    // Check if user is already collaborator
    const isAlreadyCollab = project.collaborators.some(collab => collab.toString() === inviteeIdStr);
    if (isAlreadyCollab) {
      return res.status(400).json({ error: 'User is already a collaborator' });
    }

    project.collaborators.push(userToInvite._id as any);
    await project.save();

    const populatedProject = await Project.findById(id).populate('collaborators', 'username email avatar');

    return res.status(200).json({
      message: 'Collaborator added successfully',
      collaborators: populatedProject?.collaborators || []
    });
  } catch (error: any) {
    console.error('Invite Collaborator Error:', error);
    return res.status(500).json({ error: error.message || 'Error inviting collaborator' });
  }
};
