import { create } from 'zustand';
import { apiClient } from '../services/api';

export interface FileItem {
  _id?: string;
  path: string;
  isFolder: boolean;
  content: string;
  language: string;
}

export interface UserSummary {
  _id: string;
  username: string;
  email: string;
  avatar: string;
}

export interface ProjectItem {
  _id: string;
  name: string;
  projectName: string;
  description: string;
  roomId: string;
  owner: UserSummary;
  collaborators: UserSummary[];
  members: UserSummary[];
  visibility: 'private' | 'public';
  files: FileItem[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  projects: ProjectItem[];
  activeProject: ProjectItem | null;
  activeFileId: string | null;
  activeFileContent: string;
  openTabs: string[]; // List of file IDs/paths currently open as tabs
  isLoading: boolean;
  error: string | null;
  breakpoints: Record<string, number[]>; // fileId -> lines
  unsavedFiles: Record<string, boolean>; // fileId -> boolean

  // Local workspace state
  isLocalWorkspace: boolean;
  localDirectoryHandle: any | null; // FileSystemDirectoryHandle
  localFiles: FileItem[];
  localWorkspaceName: string;

  fetchProjects: () => Promise<void>;
  createProject: (details: { projectName: string; description?: string; visibility?: 'private' | 'public' }) => Promise<ProjectItem>;
  deleteProject: (projectId: string) => Promise<void>;
  inviteCollaborator: (projectId: string, invitee: string) => Promise<UserSummary[]>;
  setActiveProject: (project: ProjectItem | null) => void;
  setActiveFileId: (fileId: string | null) => void;
  setActiveFileContent: (content: string) => void;
  fetchProjectById: (projectId: string) => Promise<ProjectItem>;
  updateProjectFiles: (files: FileItem[]) => void;
  addProjectFile: (file: FileItem) => void;
  toggleBreakpoint: (fileId: string, line: number) => void;
  clearBreakpoints: (fileId: string) => void;

  // New actions for tabs & unsaved files
  openTab: (fileId: string) => void;
  closeTab: (fileId: string) => void;
  setFileUnsaved: (fileId: string, unsaved: boolean) => void;

  // Unified File CRUD
  createFile: (path: string, isFolder: boolean, socket?: any) => Promise<void>;
  renameFile: (fileId: string, newPath: string, socket?: any) => Promise<void>;
  deleteFile: (fileId: string, socket?: any) => Promise<void>;

  // Local workspace actions
  setLocalWorkspace: (handle: any, files: FileItem[], name: string) => void;
  saveActiveFile: (socket?: any) => Promise<void>;
  closeWorkspace: () => void;
}

// Helper to determine language from file extension
const getLanguageFromPath = (path: string): string => {
  const ext = path.split('.').pop() || '';
  const langMap: Record<string, string> = {
    'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
    'py': 'python', 'java': 'java', 'cpp': 'cpp', 'cc': 'cpp', 'c': 'c',
    'go': 'go', 'rs': 'rust', 'kt': 'kotlin', 'json': 'json', 'md': 'markdown', 'html': 'html', 'css': 'css'
  };
  return langMap[ext.toLowerCase()] || 'plaintext';
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProject: null,
  activeFileId: null,
  activeFileContent: '',
  openTabs: [],
  isLoading: false,
  error: null,
  breakpoints: {},
  unsavedFiles: {},

  // Local Workspace States
  isLocalWorkspace: false,
  localDirectoryHandle: null,
  localFiles: [],
  localWorkspaceName: '',

  setActiveFileId: (fileId) => {
    const { isLocalWorkspace, localFiles, activeProject } = get();
    let content = '';
    if (fileId) {
      if (isLocalWorkspace) {
        const file = localFiles.find(f => f._id === fileId || f.path === fileId);
        if (file) content = file.content;
      } else if (activeProject) {
        const file = activeProject.files.find(f => f._id === fileId);
        if (file) content = file.content;
      }
    }
    set({ activeFileId: fileId, activeFileContent: content });
    if (fileId) {
      get().openTab(fileId);
    }
  },

  setActiveFileContent: (content) => {
    const { activeFileId, isLocalWorkspace } = get();
    set({ activeFileContent: content });
    
    if (activeFileId) {
      // Mark file as unsaved
      get().setFileUnsaved(activeFileId, true);

      // Keep local list in sync in memory
      if (isLocalWorkspace) {
        set((state) => ({
          localFiles: state.localFiles.map(f => f._id === activeFileId ? { ...f, content } : f)
        }));
      } else {
        set((state) => {
          if (!state.activeProject) return {};
          return {
            activeProject: {
              ...state.activeProject,
              files: state.activeProject.files.map(f => f._id === activeFileId ? { ...f, content } : f)
            }
          };
        });
      }
    }
  },

  toggleBreakpoint: (fileId, line) => set((state) => {
    const current = state.breakpoints[fileId] || [];
    const updated = current.includes(line)
      ? current.filter(l => l !== line)
      : [...current, line];
    return {
      breakpoints: { ...state.breakpoints, [fileId]: updated }
    };
  }),

  clearBreakpoints: (fileId) => set((state) => {
    const updated = { ...state.breakpoints };
    delete updated[fileId];
    return { breakpoints: updated };
  }),

  openTab: (fileId) => set((state) => {
    if (state.openTabs.includes(fileId)) return {};
    return { openTabs: [...state.openTabs, fileId] };
  }),

  closeTab: (fileId) => set((state) => {
    const nextTabs = state.openTabs.filter(t => t !== fileId);
    let nextActive = state.activeFileId;
    if (state.activeFileId === fileId) {
      nextActive = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null;
    }
    
    // Defer setting active file so layout updates clean up properly
    setTimeout(() => {
      get().setActiveFileId(nextActive);
    }, 0);

    return {
      openTabs: nextTabs,
      activeFileId: nextActive
    };
  }),

  setFileUnsaved: (fileId, unsaved) => set((state) => ({
    unsavedFiles: { ...state.unsavedFiles, [fileId]: unsaved }
  })),

  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient('/projects', { method: 'GET' });
      const workspaces = (data.workspaces || []).map((w: any) => ({
        ...w,
        name: w.projectName,
        collaborators: w.members || []
      }));
      set({ projects: workspaces, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch projects', isLoading: false });
    }
  },

  createProject: async (details) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient('/projects', {
        method: 'POST',
        body: details,
      });
      const newProject = {
        ...data.workspace,
        name: data.workspace.projectName,
        collaborators: data.workspace.members || []
      };
      set((state) => ({
        projects: [newProject, ...state.projects],
        isLoading: false,
      }));
      return newProject;
    } catch (err: any) {
      set({ error: err.message || 'Failed to create project', isLoading: false });
      throw err;
    }
  },

  deleteProject: async (projectId) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient(`/projects/${projectId}`, { method: 'DELETE' });
      set((state) => ({
        projects: state.projects.filter((p) => p._id !== projectId),
        activeProject: state.activeProject?._id === projectId ? null : state.activeProject,
        isLoading: false,
      }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete project', isLoading: false });
      throw err;
    }
  },

  inviteCollaborator: async (projectId, invitee) => {
    set({ error: null });
    try {
      const data = await apiClient(`/projects/${projectId}/invite`, {
        method: 'POST',
        body: { invitee },
      });
      
      const updatedCollaborators = data.collaborators;
      set((state) => {
        const updatedProjects = state.projects.map((p) => {
          if (p._id === projectId) {
            return { ...p, collaborators: updatedCollaborators };
          }
          return p;
        });

        const updatedActive = state.activeProject?._id === projectId
          ? { ...state.activeProject, collaborators: updatedCollaborators }
          : state.activeProject;

        return {
          projects: updatedProjects,
          activeProject: updatedActive,
        };
      });
      return updatedCollaborators;
    } catch (err: any) {
      set({ error: err.message || 'Failed to invite collaborator' });
      throw err;
    }
  },

  setActiveProject: (project) => {
    if (project) {
      set({ 
        activeProject: project, 
        isLocalWorkspace: false,
        localDirectoryHandle: null,
        localFiles: [],
        openTabs: [],
        activeFileId: null,
        activeFileContent: ''
      });
    } else {
      set({ activeProject: null, openTabs: [], activeFileId: null, activeFileContent: '' });
    }
  },

  fetchProjectById: async (roomId) => {
    set({ isLoading: true, error: null });
    try {
      const data = await apiClient(`/projects/room/${roomId}`, { method: 'GET' });
      const ws = {
        ...data.workspace,
        name: data.workspace.projectName,
        collaborators: data.workspace.members || []
      };
      set({ activeProject: ws, isLoading: false, isLocalWorkspace: false });
      return ws;
    } catch (err: any) {
      set({ error: err.message || 'Failed to load project details', isLoading: false });
      throw err;
    }
  },

  updateProjectFiles: (files) => set((state) => {
    if (!state.activeProject) return {};
    return {
      activeProject: { ...state.activeProject, files }
    };
  }),

  addProjectFile: (file) => set((state) => {
    if (!state.activeProject) return {};
    const exists = state.activeProject.files.some(f => f.path === file.path);
    if (exists) return {};
    return {
      activeProject: {
        ...state.activeProject,
        files: [...state.activeProject.files, file]
      }
    };
  }),

  // File CRUD Operations
  createFile: async (path, isFolder, socket) => {
    const { isLocalWorkspace, localDirectoryHandle, activeProject } = get();

    if (isLocalWorkspace) {
      if (!localDirectoryHandle) return;
      try {
        const parts = path.split('/');
        let currentDir = localDirectoryHandle;
        for (let i = 0; i < parts.length - 1; i++) {
          currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
        }
        const name = parts[parts.length - 1];
        if (isFolder) {
          await currentDir.getDirectoryHandle(name, { create: true });
        } else {
          const fileHandle = await currentDir.getFileHandle(name, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write('');
          await writable.close();
        }
        
        // Re-read workspace directories
        const filesList: FileItem[] = [];
        const readDir = async (dirHandle: any, currentPath = '') => {
          for await (const entry of dirHandle.values()) {
            const rel = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            if (entry.kind === 'file') {
              const file = await entry.getFile();
              const content = await file.text();
              filesList.push({
                _id: rel,
                path: rel,
                isFolder: false,
                content,
                language: getLanguageFromPath(rel)
              });
            } else if (entry.kind === 'directory') {
              filesList.push({
                _id: rel,
                path: rel,
                isFolder: true,
                content: '',
                language: 'plaintext'
              });
              await readDir(entry, rel);
            }
          }
        };
        await readDir(localDirectoryHandle);
        set({ localFiles: filesList });
      } catch (err) {
        console.error('Failed to create local file/folder:', err);
        alert('Failed to create file/folder locally. Check folder permissions.');
      }
    } else {
      if (!activeProject || !socket) return;
      socket.emit('file-create', {
        projectId: activeProject._id,
        roomId: activeProject.roomId,
        path,
        isFolder,
        language: getLanguageFromPath(path)
      });
    }
  },

  renameFile: async (fileId, newPath, socket) => {
    const { isLocalWorkspace, localDirectoryHandle, activeProject, localFiles } = get();

    if (isLocalWorkspace) {
      if (!localDirectoryHandle) return;
      try {
        const item = localFiles.find(f => f._id === fileId);
        if (!item) return;

        const oldPath = item.path;
        if (item.isFolder) {
          alert('Local folder renaming is not supported directly in the browser. Please rename manually in file explorer.');
          return;
        }

        // Rename file locally: read contents, write to new name, delete old
        const partsOld = oldPath.split('/');
        let currentDirOld = localDirectoryHandle;
        for (let i = 0; i < partsOld.length - 1; i++) {
          currentDirOld = await currentDirOld.getDirectoryHandle(partsOld[i]);
        }
        const oldName = partsOld[partsOld.length - 1];

        const partsNew = newPath.split('/');
        let currentDirNew = localDirectoryHandle;
        for (let i = 0; i < partsNew.length - 1; i++) {
          currentDirNew = await currentDirNew.getDirectoryHandle(partsNew[i], { create: true });
        }
        const newName = partsNew[partsNew.length - 1];

        // Create new file with same content
        const fileHandle = await currentDirNew.getFileHandle(newName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(item.content);
        await writable.close();

        // Remove old entry
        await currentDirOld.removeEntry(oldName);

        // Re-read workspace
        const filesList: FileItem[] = [];
        const readDir = async (dirHandle: any, currentPath = '') => {
          for await (const entry of dirHandle.values()) {
            const rel = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            if (entry.kind === 'file') {
              const file = await entry.getFile();
              const content = await file.text();
              filesList.push({
                _id: rel,
                path: rel,
                isFolder: false,
                content,
                language: getLanguageFromPath(rel)
              });
            } else if (entry.kind === 'directory') {
              filesList.push({
                _id: rel,
                path: rel,
                isFolder: true,
                content: '',
                language: 'plaintext'
              });
              await readDir(entry, rel);
            }
          }
        };
        await readDir(localDirectoryHandle);
        set({ 
          localFiles: filesList,
          activeFileId: get().activeFileId === fileId ? newPath : get().activeFileId,
          openTabs: get().openTabs.map(t => t === fileId ? newPath : t)
        });
      } catch (err) {
        console.error('Failed to rename local file:', err);
        alert('Failed to rename file locally.');
      }
    } else {
      if (!activeProject || !socket) return;
      socket.emit('file-rename', {
        projectId: activeProject._id,
        roomId: activeProject.roomId,
        fileId,
        newPath
      });
    }
  },

  deleteFile: async (fileId, socket) => {
    const { isLocalWorkspace, localDirectoryHandle, activeProject, localFiles } = get();

    if (isLocalWorkspace) {
      if (!localDirectoryHandle) return;
      try {
        const item = localFiles.find(f => f._id === fileId);
        if (!item) return;

        const path = item.path;
        const parts = path.split('/');
        let currentDir = localDirectoryHandle;
        for (let i = 0; i < parts.length - 1; i++) {
          currentDir = await currentDir.getDirectoryHandle(parts[i]);
        }
        const name = parts[parts.length - 1];
        await currentDir.removeEntry(name, { recursive: true });

        // Re-read workspace
        const filesList: FileItem[] = [];
        const readDir = async (dirHandle: any, currentPath = '') => {
          for await (const entry of dirHandle.values()) {
            const rel = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            if (entry.kind === 'file') {
              const file = await entry.getFile();
              const content = await file.text();
              filesList.push({
                _id: rel,
                path: rel,
                isFolder: false,
                content,
                language: getLanguageFromPath(rel)
              });
            } else if (entry.kind === 'directory') {
              filesList.push({
                _id: rel,
                path: rel,
                isFolder: true,
                content: '',
                language: 'plaintext'
              });
              await readDir(entry, rel);
            }
          }
        };
        await readDir(localDirectoryHandle);
        
        // Remove from tabs
        const nextTabs = get().openTabs.filter(t => t !== fileId && !t.startsWith(fileId + '/'));
        let nextActive = get().activeFileId;
        if (get().activeFileId === fileId || get().activeFileId?.startsWith(fileId + '/')) {
          nextActive = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null;
        }

        set({ 
          localFiles: filesList,
          openTabs: nextTabs,
          activeFileId: nextActive,
          activeFileContent: nextActive ? (filesList.find(f => f._id === nextActive)?.content || '') : ''
        });
      } catch (err) {
        console.error('Failed to delete local file:', err);
        alert('Failed to delete file locally.');
      }
    } else {
      if (!activeProject || !socket) return;
      socket.emit('file-delete', {
        projectId: activeProject._id,
        roomId: activeProject.roomId,
        fileId
      });
    }
  },

  // Local Workspace actions
  setLocalWorkspace: (handle, files, name) => {
    set({
      isLocalWorkspace: true,
      localDirectoryHandle: handle,
      localFiles: files,
      localWorkspaceName: name,
      activeProject: null,
      openTabs: [],
      activeFileId: null,
      activeFileContent: ''
    });
  },

  saveActiveFile: async (socket) => {
    const { activeFileId, activeFileContent, isLocalWorkspace, localDirectoryHandle, activeProject } = get();
    if (!activeFileId) return;

    if (isLocalWorkspace) {
      if (!localDirectoryHandle) return;
      try {
        const parts = activeFileId.split('/');
        let currentDir = localDirectoryHandle;
        for (let i = 0; i < parts.length - 1; i++) {
          currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
        }
        const name = parts[parts.length - 1];
        const fileHandle = await currentDir.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(activeFileContent);
        await writable.close();
        
        // Clear unsaved flag
        get().setFileUnsaved(activeFileId, false);
      } catch (err) {
        console.error('Failed to save local file:', err);
        alert('Failed to save file to local disk. Verify folder access permissions.');
      }
    } else {
      if (!activeProject || !socket) return;
      socket.emit('code-update', {
        projectId: activeProject._id,
        roomId: activeProject.roomId,
        fileId: activeFileId,
        content: activeFileContent
      });
      // Clear unsaved flag
      get().setFileUnsaved(activeFileId, false);
    }
  },

  closeWorkspace: () => {
    set({
      isLocalWorkspace: false,
      localDirectoryHandle: null,
      localFiles: [],
      localWorkspaceName: '',
      activeProject: null,
      openTabs: [],
      activeFileId: null,
      activeFileContent: ''
    });
  }
}));
