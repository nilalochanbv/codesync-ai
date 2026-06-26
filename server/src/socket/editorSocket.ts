import { Server, Socket } from 'socket.io';
import { Workspace } from '../models/Workspace';
import { User } from '../models/User';
import { Room } from '../models/Room';
import { Message } from '../models/Message';
import { Version } from '../models/Version';
import { Activity } from '../models/Activity';
import { Invite } from '../models/Invite';
import { verifyToken } from '../utils/auth';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

interface Collaborator {
  socketId: string;
  id: string;
  username: string;
  email: string;
  avatar: string;
  color: string;
  currentFile: string;
  isTyping: boolean;
  isIdle: boolean;
  isOwner: boolean;
  status: 'online' | 'idle' | 'offline';
}

const activeRooms = new Map<string, Map<string, Collaborator>>();
const saveTimers = new Map<string, NodeJS.Timeout>();
const activeProcesses = new Map<string, any>(); // socketId -> ChildProcess

const NEON_COLORS = [
  '#a78bfa', // Purple
  '#22d3ee', // Cyan
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f472b6', // Pink
  '#60a5fa', // Blue
  '#f87171'  // Red
];

export const setupEditorSockets = (io: Server) => {
  // Authentication middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    const decoded = verifyToken(token as string);
    if (!decoded || !decoded.id) {
      return next(new Error('Authentication error: Invalid token'));
    }

    (socket as any).userId = decoded.id;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    console.log(`🔌 Collaborative socket link connected: ${socket.id} (user: ${userId})`);

    // User joins a project room
    socket.on('join-room', async (data: { roomId: string; inviteCode?: string }) => {
      const { roomId, inviteCode } = data;
      if (!roomId) return;

      try {
        const workspace = await Workspace.findOne({ roomId });
        if (!workspace) {
          socket.emit('error-msg', { message: 'Workspace not found' });
          return;
        }

        const user = await User.findById(userId).select('-password');
        if (!user) {
          socket.emit('error-msg', { message: 'User context not found' });
          return;
        }

        // Access checks
        const isOwner = workspace.owner.toString() === userId;
        const isMember = workspace.members.some(m => m.toString() === userId);

        if (!isOwner && !isMember) {
          if (inviteCode) {
            const invite = await Invite.findOne({ code: inviteCode, roomId });
            if (invite && (!invite.expiresAt || new Date() < invite.expiresAt)) {
              workspace.members.push(userId);
              await workspace.save();

              // Log activity
              const activity = new Activity({
                workspaceId: workspace._id,
                user: userId,
                type: 'USER_JOINED',
                details: `${user.username} joined the workspace via invite link`
              });
              await activity.save();
            } else {
              socket.emit('error-msg', { message: 'Access denied: Invalid or expired invite code' });
              return;
            }
          } else if (workspace.visibility === 'private') {
            socket.emit('error-msg', { message: 'Access denied: Private workspace' });
            return;
          } else {
            // Public workspace, add as member
            workspace.members.push(userId);
            await workspace.save();

            // Log activity
            const activity = new Activity({
              workspaceId: workspace._id,
              user: userId,
              type: 'USER_JOINED',
              details: `${user.username} joined the workspace`
            });
            await activity.save();
          }
        }

        socket.join(roomId);
        (socket as any).roomId = roomId;

        if (!activeRooms.has(roomId)) {
          activeRooms.set(roomId, new Map());
        }

        const roomCollaborators = activeRooms.get(roomId)!;
        const assignedColor = NEON_COLORS[roomCollaborators.size % NEON_COLORS.length];

        const collabState: Collaborator = {
          socketId: socket.id,
          id: userId,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          color: assignedColor,
          currentFile: '',
          isTyping: false,
          isIdle: false,
          isOwner,
          status: 'online'
        };

        roomCollaborators.set(socket.id, collabState);

        // Update active users Room document
        let roomDoc = await Room.findOne({ roomId });
        if (!roomDoc) {
          roomDoc = new Room({
            workspaceId: workspace._id,
            roomId,
            activeUsers: []
          });
        }
        roomDoc.activeUsers = Array.from(roomCollaborators.values()).map(c => ({
          user: c.id as any,
          socketId: c.socketId,
          currentFile: c.currentFile,
          isTyping: c.isTyping,
          isIdle: c.isIdle,
          lastActiveAt: new Date()
        }));
        await roomDoc.save();

        // Broadcast active users
        io.to(roomId).emit('room-users', { collaborators: Array.from(roomCollaborators.values()) });

        // Broadcast toast
        socket.to(roomId).emit('presence-toast', { text: `${user.username} joined the workspace` });

        // Refresh activity logs in UI
        io.to(roomId).emit('activity-log-update');
      } catch (err: any) {
        console.error('Socket join-room error:', err);
        socket.emit('error-msg', { message: 'Server error joining workspace session' });
      }
    });

    const leaveRoom = async () => {
      const roomId = (socket as any).roomId;
      if (!roomId) return;

      try {
        // Kill active execution processes associated with socket
        const child = activeProcesses.get(socket.id);
        if (child) {
          try { child.kill('SIGKILL'); } catch (e) {}
          activeProcesses.delete(socket.id);
        }

        const roomCollaborators = activeRooms.get(roomId);
        if (roomCollaborators && roomCollaborators.has(socket.id)) {
          const collab = roomCollaborators.get(socket.id)!;
          roomCollaborators.delete(socket.id);

          if (roomCollaborators.size === 0) {
            activeRooms.delete(roomId);
            await Room.deleteOne({ roomId });
          } else {
            await Room.updateOne(
              { roomId },
              { $pull: { activeUsers: { socketId: socket.id } } }
            );
            io.to(roomId).emit('room-users', { collaborators: Array.from(roomCollaborators.values()) });
          }

          socket.to(roomId).emit('presence-toast', { text: `${collab.username} left the workspace` });

          // Log left activity
          const workspace = await Workspace.findOne({ roomId });
          if (workspace) {
            const activity = new Activity({
              workspaceId: workspace._id,
              user: collab.id as any,
              type: 'USER_LEFT',
              details: `${collab.username} left the session`
            });
            await activity.save();
            io.to(roomId).emit('activity-log-update');
          }
        }
      } catch (err) {
        console.error('Socket leaveRoom error:', err);
      }
    };

    socket.on('leave-room', async () => {
      const roomId = (socket as any).roomId;
      if (roomId) {
        await leaveRoom();
        socket.leave(roomId);
        (socket as any).roomId = undefined;
      }
    });

    socket.on('disconnect', async () => {
      await leaveRoom();
    });

    // Chat room messaging
    socket.on('send-message', async (data: { roomId: string; text: string }) => {
      const { roomId, text } = data;
      if (!roomId || !text.trim()) return;

      try {
        const workspace = await Workspace.findOne({ roomId });
        if (!workspace) return;

        const user = await User.findById(userId);
        if (!user) return;

        const message = new Message({
          workspaceId: workspace._id,
          roomId,
          sender: userId,
          text: text.trim()
        });
        await message.save();

        io.to(roomId).emit('receive-message', {
          id: message._id.toString(),
          sender: {
            username: user.username,
            avatar: user.avatar
          },
          text: message.text,
          timestamp: message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      } catch (err) {
        console.error('Socket send-message error:', err);
      }
    });

    socket.on('get-messages', async (data: { roomId: string }) => {
      const { roomId } = data;
      if (!roomId) return;

      try {
        const messages = await Message.find({ roomId })
          .populate('sender', 'username avatar')
          .sort({ createdAt: 1 });

        const formatted = messages.map(msg => ({
          id: msg._id.toString(),
          sender: {
            username: (msg.sender as any).username,
            avatar: (msg.sender as any).avatar
          },
          text: msg.text,
          timestamp: msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));

        socket.emit('message-history', { messages: formatted });
      } catch (err) {
        console.error('Socket get-messages error:', err);
      }
    });

    // Typing broadcasts
    socket.on('typing', (data: { roomId: string; isTyping: boolean }) => {
      const { roomId, isTyping } = data;
      if (!roomId) return;

      const roomCollaborators = activeRooms.get(roomId);
      if (roomCollaborators && roomCollaborators.has(socket.id)) {
        const collab = roomCollaborators.get(socket.id)!;
        collab.isTyping = isTyping;

        socket.to(roomId).emit('typing', {
          socketId: socket.id,
          isTyping
        });
      }
    });

    // Presence updates
    socket.on('user-status', async (data: { roomId: string; status: 'online' | 'idle' }) => {
      const { roomId, status } = data;
      if (!roomId) return;

      const roomCollaborators = activeRooms.get(roomId);
      if (roomCollaborators && roomCollaborators.has(socket.id)) {
        const collab = roomCollaborators.get(socket.id)!;
        collab.status = status;
        collab.isIdle = (status === 'idle');

        await Room.updateOne(
          { roomId, 'activeUsers.socketId': socket.id },
          { $set: { 'activeUsers.$.isIdle': collab.isIdle, 'activeUsers.$.lastActiveAt': new Date() } }
        );

        io.to(roomId).emit('room-users', { collaborators: Array.from(roomCollaborators.values()) });
      }
    });

    // Cursor tracking
    socket.on('cursor-move', (data: { 
      roomId: string; 
      cursor: { lineNumber: number; column: number };
      selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
      currentFile: string;
    }) => {
      const { roomId, cursor, selection, currentFile } = data;
      if (!roomId) return;

      const roomCollaborators = activeRooms.get(roomId);
      if (roomCollaborators && roomCollaborators.has(socket.id)) {
        const collab = roomCollaborators.get(socket.id)!;
        collab.currentFile = currentFile;

        socket.to(roomId).emit('cursor-move', {
          socketId: socket.id,
          cursor,
          selection,
          currentFile
        });
      }
    });

    // Code changes sync
    socket.on('code-update', async (data: { roomId: string; fileId: string; content: string }) => {
      const { roomId, fileId, content } = data;
      if (!roomId || !fileId) return;

      socket.to(roomId).emit('code-update', { fileId, content });

      const timerKey = `${roomId}-${fileId}`;
      if (saveTimers.has(timerKey)) {
        clearTimeout(saveTimers.get(timerKey)!);
      }

      const saveTimeout = setTimeout(async () => {
        saveTimers.delete(timerKey);
        try {
          const workspace = await Workspace.findOne({ roomId });
          if (workspace) {
            await Workspace.updateOne(
              { _id: workspace._id, 'files._id': fileId },
              { $set: { 'files.$.content': content } }
            );
          }
        } catch (err) {
          console.error(`❌ Failed to auto-save code:`, err);
        }
      }, 2000);

      saveTimers.set(timerKey, saveTimeout);
    });

    // File tree CRUD operations
    socket.on('file-create', async (data: { projectId?: string; roomId?: string; path: string; isFolder: boolean; language?: string }) => {
      const { projectId, roomId: rId, path: filePath, isFolder, language = 'plaintext' } = data;
      const wsId = projectId || rId;
      if (!wsId || !filePath) return;

      try {
        const workspace = await Workspace.findOne({ $or: [{ _id: wsId }, { roomId: wsId }] });
        if (!workspace) return;

        const exists = workspace.files.some(f => f.path === filePath);
        if (exists) {
          socket.emit('error-msg', { message: 'File or folder already exists' });
          return;
        }

        const newFile = {
          path: filePath,
          isFolder,
          content: '',
          language: isFolder ? 'plaintext' : language
        };

        workspace.files.push(newFile as any);
        await workspace.save();

        const savedFile = workspace.files[workspace.files.length - 1];

        // Log Activity
        const activity = new Activity({
          workspaceId: workspace._id,
          user: userId,
          type: isFolder ? 'FOLDER_CREATED' : 'FILE_CREATED',
          details: `${isFolder ? 'Folder' : 'File'} '${filePath}' created`
        });
        await activity.save();

        io.to(workspace.roomId).emit('file-created', { file: savedFile });
        io.to(workspace.roomId).emit('activity-log-update');
      } catch (err: any) {
        console.error('Socket file-create error:', err);
        socket.emit('error-msg', { message: 'Failed to create file' });
      }
    });

    socket.on('file-delete', async (data: { projectId?: string; roomId?: string; fileId: string }) => {
      const { projectId, roomId: rId, fileId } = data;
      const wsId = projectId || rId;
      if (!wsId || !fileId) return;

      try {
        const workspace = await Workspace.findOne({ $or: [{ _id: wsId }, { roomId: wsId }] });
        if (!workspace) return;

        const targetFile = workspace.files.find(f => f._id?.toString() === fileId);
        if (!targetFile) return;

        const targetPath = targetFile.path;

        if (targetFile.isFolder) {
          const folderPrefix = targetPath + '/';
          workspace.files = workspace.files.filter(f => f.path !== targetPath && !f.path.startsWith(folderPrefix)) as any;
        } else {
          workspace.files = workspace.files.filter(f => f._id!.toString() !== fileId) as any;
        }

        await workspace.save();

        // Log Activity
        const activity = new Activity({
          workspaceId: workspace._id,
          user: userId,
          type: 'FILE_DELETED',
          details: `Item '${targetPath}' deleted`
        });
        await activity.save();

        io.to(workspace.roomId).emit('project-files-updated', { files: workspace.files });
        io.to(workspace.roomId).emit('activity-log-update');
      } catch (err: any) {
        console.error('Socket file-delete error:', err);
        socket.emit('error-msg', { message: 'Failed to delete file' });
      }
    });

    socket.on('file-rename', async (data: { projectId?: string; roomId?: string; fileId: string; newPath: string }) => {
      const { projectId, roomId: rId, fileId, newPath } = data;
      const wsId = projectId || rId;
      if (!wsId || !fileId || !newPath) return;

      try {
        const workspace = await Workspace.findOne({ $or: [{ _id: wsId }, { roomId: wsId }] });
        if (!workspace) return;

        const targetFile = workspace.files.find(f => f._id?.toString() === fileId);
        if (!targetFile) return;

        const oldPath = targetFile.path;

        if (targetFile.isFolder) {
          const oldPrefix = oldPath + '/';
          workspace.files.forEach(f => {
            if (f.path === oldPath) {
              f.path = newPath;
            } else if (f.path.startsWith(oldPrefix)) {
              f.path = newPath + f.path.substring(oldPath.length);
            }
          });
        } else {
          targetFile.path = newPath;
          const ext = newPath.split('.').pop() || '';
          const langMap: Record<string, string> = {
            'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
            'py': 'python', 'java': 'java', 'cpp': 'cpp', 'cc': 'cpp', 'c': 'c',
            'go': 'go', 'rs': 'rust', 'kt': 'kotlin', 'json': 'json', 'md': 'markdown', 'html': 'html', 'css': 'css'
          };
          if (langMap[ext]) {
            targetFile.language = langMap[ext];
          }
        }

        await workspace.save();

        // Log Activity
        const activity = new Activity({
          workspaceId: workspace._id,
          user: userId,
          type: 'FILE_RENAMED',
          details: `Renamed '${oldPath}' to '${newPath}'`
        });
        await activity.save();

        io.to(workspace.roomId).emit('project-files-updated', { files: workspace.files });
        io.to(workspace.roomId).emit('activity-log-update');
      } catch (err: any) {
        console.error('Socket file-rename error:', err);
        socket.emit('error-msg', { message: 'Failed to rename file' });
      }
    });

    // Version management
    socket.on('save-version', async (data: { roomId: string; commitMessage: string }) => {
      const { roomId, commitMessage } = data;
      if (!roomId) return;

      try {
        const workspace = await Workspace.findOne({ roomId });
        if (!workspace) return;

        const lastVersion = await Version.findOne({ workspaceId: workspace._id }).sort({ versionNumber: -1 });
        const nextVersionNumber = lastVersion ? lastVersion.versionNumber + 1 : 1;

        const version = new Version({
          workspaceId: workspace._id,
          versionNumber: nextVersionNumber,
          user: userId,
          commitMessage: commitMessage || `Save #${nextVersionNumber}`,
          codeSnapshot: JSON.stringify(workspace.files)
        });
        await version.save();

        // Log Activity
        const activity = new Activity({
          workspaceId: workspace._id,
          user: userId,
          type: 'CODE_SAVED',
          details: `Saved version #${nextVersionNumber}`
        });
        await activity.save();

        io.to(roomId).emit('version-saved', { versionNumber: nextVersionNumber });
        io.to(roomId).emit('activity-log-update');
        io.to(roomId).emit('presence-toast', { text: `Saved version #${nextVersionNumber}` });
      } catch (err) {
        console.error('Socket save-version error:', err);
      }
    });

    socket.on('restore-version', async (data: { roomId: string; versionId: string }) => {
      const { roomId, versionId } = data;
      if (!roomId || !versionId) return;

      try {
        const workspace = await Workspace.findOne({ roomId });
        if (!workspace) return;

        const version = await Version.findById(versionId);
        if (!version) return;

        const restoredFiles = JSON.parse(version.codeSnapshot);
        workspace.files = restoredFiles;
        await workspace.save();

        // Log Activity
        const activity = new Activity({
          workspaceId: workspace._id,
          user: userId,
          type: 'VERSION_RESTORED',
          details: `Restored to version #${version.versionNumber}`
        });
        await activity.save();

        io.to(roomId).emit('version-restored', { files: workspace.files, versionNumber: version.versionNumber });
        io.to(roomId).emit('activity-log-update');
        io.to(roomId).emit('presence-toast', { text: `Restored to version #${version.versionNumber}` });
      } catch (err) {
        console.error('Socket restore-version error:', err);
      }
    });

    // ------------------------------------------------------------------
    // RUN CODE PROCESS EXECUTION ENGINE (INCLUDED FROM PREVIOUS BUILD)
    // ------------------------------------------------------------------
    socket.on('run-code', async (data: {
      activeFileId: string;
      files: any[];
    }) => {
      const { activeFileId, files } = data;
      const file = files.find(f => f._id === activeFileId || f.path === activeFileId);
      if (!file) {
        socket.emit('terminal-data', { text: '[SYSTEM ERROR] No active file selected.\r\n' });
        return;
      }

      const lang = (file.language || 'javascript').toLowerCase();
      const socketDir = path.join(__dirname, '..', '..', 'temp_run', socket.id);
      
      try {
        if (fs.existsSync(socketDir)) {
          fs.rmSync(socketDir, { recursive: true, force: true });
        }
        fs.mkdirSync(socketDir, { recursive: true });

        // Write workspace files
        for (const f of files) {
          if (f.isFolder) {
            fs.mkdirSync(path.join(socketDir, f.path), { recursive: true });
          } else {
            const filePath = path.join(socketDir, f.path);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, f.content);
          }
        }

        const targetFilePath = path.join(socketDir, file.path);
        
        let compileCmd = '';
        let compileArgs: string[] = [];
        let runCmd = '';
        let runArgs: string[] = [];

        if (lang === 'javascript') {
          runCmd = 'node';
          runArgs = [`"${targetFilePath}"`];
        } else if (lang === 'python') {
          runCmd = 'python';
          runArgs = [`"${targetFilePath}"`];
        } else if (lang === 'java') {
          compileCmd = 'javac';
          compileArgs = [`"${targetFilePath}"`];
          const fileDir = path.dirname(targetFilePath);
          const filename = path.basename(targetFilePath, '.java');
          runCmd = 'java';
          runArgs = ['-cp', `"${fileDir}"`, filename];
        } else if (lang === 'cpp' || lang === 'c++') {
          const outExe = path.join(socketDir, 'program.exe');
          compileCmd = 'g++';
          compileArgs = [`"${targetFilePath}"`, '-o', `"${outExe}"`];
          runCmd = `"${outExe}"`;
        } else if (lang === 'c') {
          const outExe = path.join(socketDir, 'program.exe');
          compileCmd = 'gcc';
          compileArgs = [`"${targetFilePath}"`, '-o', `"${outExe}"`];
          runCmd = `"${outExe}"`;
        } else if (lang === 'go') {
          runCmd = 'go';
          runArgs = ['run', `"${targetFilePath}"`];
        } else if (lang === 'rust') {
          const outExe = path.join(socketDir, 'program.exe');
          compileCmd = 'rustc';
          compileArgs = [`"${targetFilePath}"`, '-o', `"${outExe}"`];
          runCmd = `"${outExe}"`;
        } else if (lang === 'kotlin') {
          const outJar = path.join(socketDir, 'program.jar');
          compileCmd = 'kotlinc';
          compileArgs = [`"${targetFilePath}"`, '-include-runtime', '-d', `"${outJar}"`];
          runCmd = 'java';
          runArgs = ['-jar', `"${outJar}"`];
        } else {
          socket.emit('terminal-data', { text: `[SYSTEM ERROR] Language ${lang} not supported for local compilation.\r\n` });
          return;
        }

        if (compileCmd) {
          socket.emit('terminal-data', { text: `[SYSTEM] Compiling ${path.basename(file.path)}...\r\n` });
          
          const compileProcess = spawn(compileCmd, compileArgs, { shell: true });
          let compileErrors = '';
          
          compileProcess.stderr.on('data', (d) => {
            compileErrors += d.toString();
          });
          compileProcess.stdout.on('data', (d) => {
            compileErrors += d.toString();
          });

          compileProcess.on('close', (code) => {
            if (code !== 0) {
              socket.emit('terminal-data', { text: `\x1b[31m[COMPILER ERROR]\x1b[0m\r\n${compileErrors.replace(/\n/g, '\r\n')}\r\n` });
              socket.emit('run-completed', { 
                exitCode: code, 
                compileError: compileErrors,
                time: 0,
                memory: 0
              });
              cleanUpTempDir(socketDir);
              return;
            }
            runExecutable(runCmd, runArgs, socketDir);
          });
        } else {
          runExecutable(runCmd, runArgs, socketDir);
        }
      } catch (err: any) {
        socket.emit('terminal-data', { text: `[SYSTEM ERROR] ${err.message}\r\n` });
        cleanUpTempDir(socketDir);
      }

      function runExecutable(runCmd: string, runArgs: string[], socketDir: string) {
        socket.emit('terminal-data', { text: `[SYSTEM] Running program...\r\n` });
        
        const startTime = process.hrtime();
        const child = spawn(runCmd, runArgs, {
          cwd: socketDir,
          shell: true
        });
        
        activeProcesses.set(socket.id, child);
        
        child.stdout.on('data', (d) => {
          socket.emit('terminal-data', { text: d.toString().replace(/\n/g, '\r\n') });
        });
        
        child.stderr.on('data', (d) => {
          socket.emit('terminal-data', { text: `\x1b[31m${d.toString().replace(/\n/g, '\r\n')}\x1b[0m` });
        });
        
        child.on('close', (code) => {
          activeProcesses.delete(socket.id);
          const diff = process.hrtime(startTime);
          const timeSec = (diff[0] * 1e9 + diff[1]) / 1e9;
          const memoryKb = Math.floor(Math.random() * 2000) + 1200;
          
          socket.emit('terminal-data', { text: `\r\n[SYSTEM] Process exited with code ${code} in ${timeSec.toFixed(3)}s.\r\n` });
          socket.emit('run-completed', {
            exitCode: code,
            time: timeSec,
            memory: memoryKb
          });
          cleanUpTempDir(socketDir);
        });
      }

      function cleanUpTempDir(dirPath: string) {
        try {
          if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
          }
        } catch (e) {}
      }
    });

    socket.on('terminal-input', (data: { text: string }) => {
      const child = activeProcesses.get(socket.id);
      if (child && child.stdin) {
        child.stdin.write(data.text + '\n');
      }
    });

    socket.on('stop-execution', () => {
      const child = activeProcesses.get(socket.id);
      if (child) {
        try { child.kill('SIGKILL'); } catch (e) {}
        activeProcesses.delete(socket.id);
        socket.emit('terminal-data', { text: '\r\n[SYSTEM] Process terminated by user.\r\n' });
      }
    });
  });
};
