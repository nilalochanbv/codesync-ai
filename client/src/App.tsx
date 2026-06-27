import { useEffect, useState, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from './store/useAuthStore';
import { useProjectStore, type FileItem } from './store/useProjectStore';
import Dashboard from './components/Dashboard';
import CollaborativeEditor from './components/CollaborativeEditor';
import LandingPage from './pages/LandingPage';
import { 
  ArrowLeft, FolderOpen, Play, Settings, Copy, Check, 
  MessageSquare, Users, FileText, 
  Send, ChevronRight, ChevronDown, Cpu,
  Bug, Folder, FolderPlus, FilePlus, Edit, Trash, Square, 
  Plus, X, AlertTriangle, FileCode, Coffee, Braces, BookOpen, Layers, Box, Terminal as TerminalIcon,
  Clock, History, Share2
} from 'lucide-react';
import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { apiClient } from './services/api';

const BACKEND_URL = 'http://localhost:5000';

interface ChatMessage {
  id: string;
  sender: {
    username: string;
    avatar: string;
  };
  text: string;
  timestamp: string;
}

interface Collaborator {
  socketId: string;
  id: string;
  username: string;
  avatar: string;
  color: string;
  currentFile: string;
  isTyping: boolean;
  isIdle: boolean;
  isOwner: boolean;
  status: 'online' | 'idle' | 'offline';
}

interface CompilerDiagnostic {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  fileId?: string;
  children?: Record<string, TreeNode>;
}

// Tree view building helper
function buildTree(files: FileItem[]): TreeNode {
  const root: TreeNode = { name: 'Root', path: '', isFolder: true, children: {} };

  const sortedFiles = [...files].sort((a, b) => {
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    const pathA = a.path || (a as any).name || 'untitled';
    const pathB = b.path || (b as any).name || 'untitled';
    return pathA.localeCompare(pathB);
  });

  for (const file of sortedFiles) {
    const filePath = file.path || (file as any).name || 'untitled';
    const parts = filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current.children) {
        current.children = {};
      }

      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: currentPath,
          isFolder: isLast ? file.isFolder : true,
          children: {}
        };
      }

      if (isLast) {
        current.children[part].fileId = file._id;
      }

      current = current.children[part];
    }
  }

  return root;
}

// Simulated debug step generator
function generateSimulatedDebugSteps(code: string) {
  const lines = code.split('\n');
  const steps: Array<{ line: number; variables: Record<string, any>; callStack: string[] }> = [];
  
  let variables: Record<string, any> = {};
  let callStack: string[] = ['main()'];
  
  for (let idx = 0; idx < lines.length; idx++) {
    const lineNum = idx + 1;
    const rawLine = lines[idx];
    const line = rawLine.trim();
    
    if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('/*') || line.startsWith('*')) {
      continue;
    }

    const varMatch = line.match(/(?:const|let|var|val|int|double|String|std::string)?\s*([a-zA-Z_]\w*)\s*=\s*(.*)/);
    if (varMatch) {
      const varName = varMatch[1].trim();
      let varValRaw = varMatch[2].trim().replace(/;$/, '');
      
      let varVal: any = varValRaw;
      if (varValRaw.startsWith('"') || varValRaw.startsWith("'")) {
        varVal = varValRaw.slice(1, -1);
      } else if (!isNaN(Number(varValRaw))) {
        varVal = Number(varValRaw);
      } else if (varValRaw === 'true' || varValRaw === 'false') {
        varVal = varValRaw === 'true';
      } else if (variables[varValRaw] !== undefined) {
        varVal = variables[varValRaw];
      }
      
      variables = { ...variables, [varName]: varVal };
    }

    const funcCallMatch = line.match(/([a-zA-Z_]\w*)\s*\((.*?)\)/);
    if (funcCallMatch && 
        !line.startsWith('function') && 
        !line.startsWith('def') && 
        !line.startsWith('public') && 
        !line.startsWith('void') && 
        !line.startsWith('System.out') && 
        !line.startsWith('print') && 
        !line.startsWith('console.log')) {
      const funcName = funcCallMatch[1];
      if (funcName !== 'main') {
        callStack = [...callStack, `${funcName}()`];
        steps.push({ line: lineNum, variables: { ...variables }, callStack: [...callStack] });
        
        const funcDefIndex = lines.findIndex(l => l.includes(`function ${funcName}`) || l.includes(`def ${funcName}`) || l.includes(`void ${funcName}`));
        if (funcDefIndex !== -1) {
          for (let f = funcDefIndex + 1; f < lines.length; f++) {
            const fLine = lines[f].trim();
            if (fLine.startsWith('}') || fLine.startsWith('return') || fLine === '') break;
            
            const fVarMatch = fLine.match(/(?:const|let|var|val|int|double|String)?\s*([a-zA-Z_]\w*)\s*=\s*(.*)/);
            if (fVarMatch) {
              const fVarName = fVarMatch[1].trim();
              const fVarVal = fVarMatch[2].trim().replace(/;$/, '');
              variables = { ...variables, [fVarName]: fVarVal.replace(/['"]/g, '') };
            }
            steps.push({ line: f + 1, variables: { ...variables }, callStack: [...callStack] });
          }
        }
        
        callStack = callStack.filter(s => s !== `${funcName}()`);
        steps.push({ line: lineNum, variables: { ...variables }, callStack: [...callStack] });
        continue;
      }
    }

    steps.push({
      line: lineNum,
      variables: { ...variables },
      callStack: [...callStack]
    });
  }

  return steps;
}

function evaluateWatchExpression(expr: string, vars: Record<string, any>): string {
  try {
    const varKeys = Object.keys(vars);
    const varVals = Object.values(vars);
    const evaluator = new Function(...varKeys, `return ${expr};`);
    const res = evaluator(...varVals);
    return typeof res === 'object' ? JSON.stringify(res) : String(res);
  } catch (err) {
    return 'ReferenceError';
  }
}

// File extension color icons selector
function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  if (filename === 'package.json') return <Box className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  if (filename === 'Dockerfile') return <Layers className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
  if (filename.startsWith('.env')) return <Settings className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
  
  switch (ext) {
    case 'java':
      return <Coffee className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
    case 'py':
      return <TerminalIcon className="h-3.5 w-3.5 text-yellow-400 shrink-0" />;
    case 'cpp':
    case 'c':
    case 'cc':
    case 'h':
      return <FileCode className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
    case 'js':
    case 'jsx':
      return <FileCode className="h-3.5 w-3.5 text-yellow-400 shrink-0" />;
    case 'ts':
    case 'tsx':
      return <FileCode className="h-3.5 w-3.5 text-sky-400 shrink-0" />;
    case 'json':
      return <Braces className="h-3.5 w-3.5 text-teal-400 shrink-0" />;
    case 'md':
      return <BookOpen className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    case 'html':
      return <FileCode className="h-3.5 w-3.5 text-orange-400 shrink-0" />;
    case 'css':
      return <FileCode className="h-3.5 w-3.5 text-pink-400 shrink-0" />;
    default:
      return <FileText className="h-3.5 w-3.5 text-text-dark shrink-0" />;
  }
}

export default function App() {
  const { isLoading, checkAuth } = useAuthStore();
  const [toasts, setToasts] = useState<{ id: string; text: string }[]>([]);

  // Run session check on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const showToast = (text: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, text }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#181818] text-text select-none">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center animate-spin">
            <Cpu className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xs text-text-muted font-medium uppercase tracking-wider animate-pulse">
            Verifying secure session...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#1e1e1e] text-text">
      <Routes>
        <Route path="/" element={<DashboardRoute />} />
        <Route path="/room/:roomId" element={<WorkspaceRoomRoute showToast={showToast} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Floating Toasts container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="bg-[#181818] border border-primary/30 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-premium pointer-events-auto flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardRoute() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <LandingPage />;
  return <Dashboard />;
}

function WorkspaceRoomRoute({ showToast }: { showToast: (text: string) => void }) {
  const { roomId } = useParams<{ roomId: string }>();
  const { isAuthenticated, user } = useAuthStore();
  const { activeProject, fetchProjectById, error } = useProjectStore();
  const [roomLoading, setRoomLoading] = useState(true);
  const [roomError, setRoomError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadRoom = async () => {
      if (!roomId) return;
      try {
        setRoomLoading(true);
        setRoomError(null);
        await fetchProjectById(roomId);
        setRoomLoading(false);
      } catch (err: any) {
        setRoomLoading(false);
        setRoomError(err.message || 'Workspace not found');
      }
    };

    if (isAuthenticated) {
      loadRoom();
    }
  }, [roomId, isAuthenticated]);

  if (!isAuthenticated) {
    if (roomId) localStorage.setItem('redirect_room', roomId);
    return <LandingPage />;
  }

  if (roomLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#181818] text-text select-none">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center animate-spin">
            <Cpu className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xs text-text-muted font-medium uppercase tracking-wider animate-pulse">
            Loading collaborative workspace...
          </span>
        </div>
      </div>
    );
  }

  if (roomError || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#181818] text-text select-none p-4">
        <div className="w-full max-w-md p-6 rounded-2xl glass-panel-heavy border border-red-500/20 text-center space-y-4">
          <div className="inline-flex h-12 w-12 rounded-full bg-red-500/10 items-center justify-center text-red-500 mb-2">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-white">Workspace Not Found</h2>
          <p className="text-xs text-text-muted">
            The workspace room link is invalid, has expired, or is private.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-border hover:bg-border/80 text-white rounded-xl text-xs font-bold transition-all"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (activeProject && user) {
    return <WorkspaceRoom activeProject={activeProject} user={user} showToast={showToast} />;
  }

  return null;
}

function WorkspaceRoom({ activeProject, user, showToast }: { activeProject: any, user: any, showToast: (text: string) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const editorRef = useRef<any>(null);
  
  const { 
    activeFileId, 
    activeFileContent,
    setActiveFileId,
    openTabs,
    closeTab,
    createFile,
    renameFile,
    deleteFile,
    isLocalWorkspace,
    localFiles,
    localWorkspaceName,
    setLocalWorkspace,
    closeWorkspace,
    breakpoints
  } = useProjectStore();

  const [socket, setSocket] = useState<Socket | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});

  // Chat message state (starts completely empty, socket populated only)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Terminal and Diagnostics state
  const [terminalInput, setTerminalInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string>('IDE terminal ready. Click Run to compile and execute the active file.\n');
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [executionMemory, setExecutionMemory] = useState<number | null>(null);
  const [activeConsoleTab, setActiveConsoleTab] = useState<'terminal' | 'problems' | 'output' | 'debug'>('terminal');
  const [diagnostics, setDiagnostics] = useState<CompilerDiagnostic[]>([]);

  // Navigation tabs
  const [sidebarTab, setSidebarTab] = useState<'explorer' | 'debugger' | 'collaborators' | 'versions' | 'timeline'>('explorer');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; node: any }>({
    visible: false,
    x: 0,
    y: 0,
    node: null
  });

  // Stepping debugger state simulator
  const [debugState, setDebugState] = useState<'idle' | 'paused' | 'stopped'>('idle');
  const [debugActiveLine, setDebugActiveLine] = useState<number | null>(null);
  const [debugVariables, setDebugVariables] = useState<Record<string, any>>({});
  const [debugCallStack, setDebugCallStack] = useState<string[]>([]);
  const [watchList, setWatchList] = useState<string[]>([]);
  const [newWatchExpr, setNewWatchExpr] = useState('');
  const debugStepsRef = useRef<Array<{ line: number; variables: Record<string, any>; callStack: string[] }>>([]);
  const debugStepIndexRef = useRef<number>(0);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Invite modal states
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitePermission, setInvitePermission] = useState<'editor' | 'viewer'>('editor');
  const [inviteExpiry, setInviteExpiry] = useState<'Never' | '1 Hour' | '24 Hours'>('Never');
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');

  // Version and Timeline states
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [commitMessage, setCommitMessage] = useState('');

  // Fetch Version History logs
  const fetchVersions = async () => {
    if (!activeProject) return;
    try {
      setVersionsLoading(true);
      const res = await apiClient(`/projects/${activeProject._id}/versions`, { method: 'GET' });
      setVersions(res.versions || []);
      setVersionsLoading(false);
    } catch (err) {
      setVersionsLoading(false);
    }
  };

  // Fetch Activity Timeline logs
  const fetchActivities = async () => {
    if (!activeProject) return;
    try {
      const res = await apiClient(`/projects/${activeProject._id}/activities`, { method: 'GET' });
      setActivities(res.activities || []);
    } catch (err) {}
  };

  // Accept / Join Room Socket link
  useEffect(() => {
    if (isLocalWorkspace) {
      setCollaborators([]);
      setChatMessages([]);
      return;
    }
    if (!activeProject) return;

    // Load History
    fetchVersions();
    fetchActivities();

    const searchParams = new URLSearchParams(location.search);
    const inviteCode = searchParams.get('invite') || undefined;

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket'],
      auth: {
        token: localStorage.getItem('codesync_token')
      }
    });

    newSocket.on('connect', () => {
      newSocket.emit('join-room', {
        roomId: activeProject.roomId,
        inviteCode
      });
      // Request chats history
      newSocket.emit('get-messages', { roomId: activeProject.roomId });
    });

    newSocket.on('room-users', (data: { collaborators: Collaborator[] }) => {
      const others = data.collaborators.filter(c => c.socketId !== newSocket.id);
      setCollaborators(others);
    });

    newSocket.on('receive-message', (message: ChatMessage) => {
      setChatMessages(prev => [...prev, message]);
    });

    newSocket.on('message-history', (data: { messages: ChatMessage[] }) => {
      setChatMessages(data.messages);
    });

    newSocket.on('typing', (data: { socketId: string; isTyping: boolean }) => {
      setTypingUsers(prev => ({
        ...prev,
        [data.socketId]: data.isTyping
      }));
    });

    newSocket.on('presence-toast', (data: { text: string }) => {
      showToast(data.text);
    });

    newSocket.on('file-created', (data: { file: FileItem }) => {
      useProjectStore.getState().addProjectFile(data.file);
    });

    newSocket.on('project-files-updated', (data: { files: FileItem[] }) => {
      const { activeFileId } = useProjectStore.getState();
      useProjectStore.getState().updateProjectFiles(data.files);
      
      const exists = data.files.some(f => f._id === activeFileId);
      if (!exists && activeFileId) {
        useProjectStore.getState().closeTab(activeFileId);
      }
    });

    // Real-time terminal data streaming
    newSocket.on('terminal-data', (data: { text: string }) => {
      setTerminalOutput(prev => prev + data.text);
    });

    newSocket.on('run-completed', (data: { exitCode: number; compileError?: string; time: number; memory: number }) => {
      setIsRunning(false);
      setExecutionTime(data.time);
      setExecutionMemory(data.memory);
      
      const files: FileItem[] = isLocalWorkspace ? localFiles : (activeProject?.files || []);
      const file = files.find((f: FileItem) => f._id === activeFileId);
      
      if (data.compileError) {
        setDiagnostics(parseCompilerError(data.compileError, file?.language || 'java'));
        setActiveConsoleTab('problems');
      } else {
        setDiagnostics([]);
      }
    });

    newSocket.on('version-saved', (data: { versionNumber: number }) => {
      showToast(`Version ${data.versionNumber} saved successfully`);
      fetchVersions();
    });

    newSocket.on('version-restored', (data: { files: FileItem[], versionNumber: number }) => {
      useProjectStore.getState().updateProjectFiles(data.files);
      const { activeFileId } = useProjectStore.getState();
      const exists = data.files.some(f => f._id === activeFileId);
      if (!exists && activeFileId) {
        useProjectStore.getState().closeTab(activeFileId);
      } else if (activeFileId) {
        const content = data.files.find(f => f._id === activeFileId)?.content || '';
        useProjectStore.getState().setActiveFileContent(content);
        useProjectStore.getState().setFileUnsaved(activeFileId, false);
      }
    });

    newSocket.on('activity-log-update', () => {
      fetchActivities();
    });

    newSocket.on('error-msg', (data: { message: string }) => {
      alert(data.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [activeProject, isLocalWorkspace]);

  // Auto Save timer hook
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const interval = setInterval(() => {
      const { unsavedFiles, saveActiveFile } = useProjectStore.getState();
      const hasUnsaved = Object.values(unsavedFiles).some(val => val === true);
      if (hasUnsaved) {
        saveActiveFile(socket);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [autoSaveEnabled, socket]);

  // Click handler to close context menu
  useEffect(() => {
    const handleClose = () => setContextMenu(prev => ({ ...prev, visible: false }));
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, []);

  // Scroll to bottom of chat list
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Scroll to bottom of terminal output
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalOutput]);

  // Fetch Versions and Activities on Sidebar tab switch
  useEffect(() => {
    if (sidebarTab === 'versions') {
      fetchVersions();
    } else if (sidebarTab === 'timeline') {
      fetchActivities();
    }
  }, [sidebarTab]);

  const handleGenerateInviteLink = async () => {
    if (!activeProject) return;
    try {
      const res = await apiClient(`/projects/${activeProject._id}/invite`, {
        method: 'POST',
        body: { permission: invitePermission, expiry: inviteExpiry }
      });
      const inviteUrl = `${window.location.origin}/room/${activeProject.roomId}?invite=${res.code}`;
      setGeneratedInviteLink(inviteUrl);
      showToast('Invite link generated successfully!');
    } catch (err) {
      alert('Failed to generate invite link');
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !socket || !activeProject) return;

    socket.emit('send-message', {
      roomId: activeProject.roomId,
      text: newMessageText.trim()
    });

    setNewMessageText('');
  };

  // Compile Error Parser
  const parseCompilerError = (errorText: string, language: string): CompilerDiagnostic[] => {
    if (!errorText) return [];
    
    const diagnosticsList: CompilerDiagnostic[] = [];
    const lines = errorText.split('\n');

    const pyPattern = /line (\d+)/i;
    const jsPattern = /evalmachine\.<anonymous>:(\d+)/i;
    const genericPattern = /:(\d+):(\d+)?:?/i; // matches file:line:col

    for (const lineText of lines) {
      if (lineText.trim() === '') continue;

      let matchedLine: number | null = null;
      let match = lineText.match(genericPattern);

      if (language === 'python') {
        const pyMatch = lineText.match(pyPattern);
        if (pyMatch) match = pyMatch;
      } else if (language === 'javascript') {
        const jsMatch = lineText.match(jsPattern);
        if (jsMatch) match = jsMatch;
      }

      if (match) {
        matchedLine = parseInt(match[1]);
      }

      if (matchedLine !== null && !isNaN(matchedLine)) {
        diagnosticsList.push({
          line: matchedLine,
          message: lineText.trim(),
          severity: 'error'
        });
      }
    }

    if (diagnosticsList.length === 0 && errorText.trim().length > 0) {
      diagnosticsList.push({
        line: 1,
        message: errorText.trim().split('\n')[0],
        severity: 'error'
      });
    }

    return diagnosticsList;
  };

  // Spawns socket child execution flow (Save -> Compile -> Execute)
  const handleRunCode = async () => {
    const currentFiles: FileItem[] = isLocalWorkspace ? localFiles : (activeProject?.files || []);
    const file = currentFiles.find((f: FileItem) => f._id === activeFileId);
    if (!file || isRunning) return;

    // Force Save
    await useProjectStore.getState().saveActiveFile(socket);

    setIsRunning(true);
    setTerminalOutput(`[SYSTEM] Starting compilation & run for ${file.path}...\n`);
    setDiagnostics([]);
    setExecutionTime(null);
    setExecutionMemory(null);
    setActiveConsoleTab('terminal');

    if (socket) {
      socket.emit('run-code', {
        activeFileId,
        files: currentFiles
      });
    }
  };

  const handleStopCode = () => {
    if (socket) {
      socket.emit('stop-execution');
    }
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !terminalInput.trim()) return;
    
    socket.emit('terminal-input', { text: terminalInput });
    setTerminalOutput(prev => prev + terminalInput + '\n');
    setTerminalInput('');
  };

  // Local file system access trigger
  const handleOpenLocalFolder = async () => {
    if (typeof (window as any).showDirectoryPicker !== 'function') {
      alert('Native File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera.');
      return;
    }

    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      const filesList: FileItem[] = [];

      const readDir = async (handle: any, currentPath = '') => {
        for await (const entry of handle.values()) {
          const rel = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            const content = await file.text();
            
            const ext = entry.name.split('.').pop() || '';
            const langMap: Record<string, string> = {
              'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
              'py': 'python', 'java': 'java', 'cpp': 'cpp', 'cc': 'cpp', 'c': 'c',
              'go': 'go', 'rs': 'rust', 'kt': 'kotlin', 'json': 'json', 'md': 'markdown', 'html': 'html', 'css': 'css'
            };

            filesList.push({
              _id: rel,
              path: rel,
              isFolder: false,
              content,
              language: langMap[ext.toLowerCase()] || 'plaintext'
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

      await readDir(dirHandle);
      setLocalWorkspace(dirHandle, filesList, dirHandle.name);
      
      const firstFile = filesList.find(f => !f.isFolder);
      if (firstFile) {
        setActiveFileId(firstFile._id!);
      }
    } catch (err) {
      console.error('Directory picker canceled or failed:', err);
    }
  };

  // Folder tree toggle expansion
  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleContextMenu = (e: React.MouseEvent, node: any) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node
    });
  };

  // Tree CRUD handlers
  const handleCreateItem = async (parentPath: string, isFolder: boolean) => {
    const name = prompt(`Enter new ${isFolder ? 'folder' : 'file'} name:`);
    if (!name) return;
    const cleanName = name.trim();
    const newPath = parentPath ? `${parentPath}/${cleanName}` : cleanName;
    await createFile(newPath, isFolder, socket);
  };

  const handleRenameItem = async (fileId: string, currentPath: string) => {
    const parts = currentPath.split('/');
    const oldName = parts[parts.length - 1];
    const name = prompt(`Enter new name for ${oldName}:`, oldName);
    if (!name) return;
    
    const cleanName = name.trim();
    parts[parts.length - 1] = cleanName;
    const newPath = parts.join('/');
    await renameFile(fileId, newPath, socket);
  };

  const handleDeleteItem = async (fileId: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      await deleteFile(fileId, socket);
    }
  };

  const handleDuplicateItem = async (fileId: string) => {
    const files: FileItem[] = isLocalWorkspace ? localFiles : (activeProject?.files || []);
    const file = files.find((f: FileItem) => f._id === fileId);
    if (!file) return;

    const parts = file.path.split('/');
    const name = parts[parts.length - 1];
    const nameParts = name.split('.');
    const ext = nameParts.pop() || '';
    const base = nameParts.join('.');
    const newName = `${base}_copy.${ext}`;
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');

    await createFile(newPath, false, socket);

    setTimeout(() => {
      const currentFiles = isLocalWorkspace ? useProjectStore.getState().localFiles : (useProjectStore.getState().activeProject?.files || []);
      const newFileObj = currentFiles.find(f => f.path === newPath);
      if (newFileObj && newFileObj._id) {
        useProjectStore.setState((state) => {
          if (state.isLocalWorkspace) {
            return {
              localFiles: state.localFiles.map(f => f.path === newPath ? { ...f, content: file.content } : f)
            };
          } else if (state.activeProject) {
            return {
              activeProject: {
                ...state.activeProject,
                files: state.activeProject.files.map(f => f.path === newPath ? { ...f, content: file.content } : f)
              }
            };
          }
          return {};
        });
        useProjectStore.getState().saveActiveFile(socket);
      }
    }, 500);
  };

  const handleSaveAs = async () => {
    const currentFiles: FileItem[] = isLocalWorkspace ? localFiles : (activeProject?.files || []);
    const file = currentFiles.find((f: FileItem) => f._id === activeFileId);
    if (!file) return;

    const newName = prompt('Save As (enter new filename/path):', file.path);
    if (!newName) return;
    const cleanPath = newName.trim();
    
    await createFile(cleanPath, false, socket);

    setTimeout(() => {
      const updatedFiles = isLocalWorkspace ? useProjectStore.getState().localFiles : (useProjectStore.getState().activeProject?.files || []);
      const newFileObj = updatedFiles.find(f => f.path === cleanPath);
      if (newFileObj && newFileObj._id) {
        useProjectStore.setState((state) => {
          if (state.isLocalWorkspace) {
            return {
              localFiles: state.localFiles.map(f => f.path === cleanPath ? { ...f, content: activeFileContent || file.content } : f)
            };
          } else if (state.activeProject) {
            return {
              activeProject: {
                ...state.activeProject,
                files: state.activeProject.files.map(f => f.path === cleanPath ? { ...f, content: activeFileContent || file.content } : f)
              }
            };
          }
          return {};
        });
        setActiveFileId(newFileObj._id);
        useProjectStore.getState().saveActiveFile(socket);
      }
    }, 500);
  };

  // Drag and Drop implementation
  const handleDragStart = (e: React.DragEvent, node: TreeNode) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ fileId: node.fileId, path: node.path, isFolder: node.isFolder }));
  };

  const handleDragOver = (e: React.DragEvent, node: TreeNode) => {
    if (node.isFolder) {
      e.preventDefault();
    }
  };

  const handleDrop = async (e: React.DragEvent, targetNode: TreeNode) => {
    e.preventDefault();
    if (!targetNode.isFolder) return;

    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const dragData = JSON.parse(dataStr);

      const oldPath = dragData.path;
      const fileId = dragData.fileId;
      const isFolder = dragData.isFolder;

      if (isFolder && targetNode.path.startsWith(oldPath)) {
        alert('Cannot move a folder inside itself or its own subdirectories.');
        return;
      }

      const parts = oldPath.split('/');
      const name = parts[parts.length - 1];
      const newPath = targetNode.path ? `${targetNode.path}/${name}` : name;

      if (oldPath === newPath) return; // No change

      await renameFile(fileId, newPath, socket);
    } catch (err) {
      console.error('Drop file move error:', err);
    }
  };

  // Language Selector Dropdown handler
  const handleLanguageChange = async (newLang: string) => {
    const currentFiles: FileItem[] = isLocalWorkspace ? localFiles : (activeProject?.files || []);
    const file = currentFiles.find((f: FileItem) => f._id === activeFileId);
    if (!file) return;

    const extMap: Record<string, string> = {
      'java': 'java', 'python': 'py', 'c': 'c', 'cpp': 'cpp', 'c++': 'cpp',
      'javascript': 'js', 'go': 'go', 'rust': 'rs', 'kotlin': 'kt'
    };
    const defaultNameMap: Record<string, string> = {
      'java': 'Main', 'python': 'main', 'c': 'main', 'cpp': 'main',
      'javascript': 'index', 'go': 'main', 'rust': 'main', 'kotlin': 'Main'
    };

    const newExt = extMap[newLang.toLowerCase()] || 'txt';
    const oldPath = file.path;
    const parts = oldPath.split('/');
    const oldFilename = parts[parts.length - 1];

    const oldNameWithoutExt = oldFilename.split('.').slice(0, -1).join('.') || defaultNameMap[newLang.toLowerCase()] || 'main';
    const newFilename = `${oldNameWithoutExt}.${newExt}`;
    parts[parts.length - 1] = newFilename;
    const newPath = parts.join('/');

    if (isLocalWorkspace) {
      useProjectStore.setState((state) => {
        const updated = state.localFiles.map(f => {
          if (f._id === activeFileId) {
            return { ...f, path: newPath, _id: newPath, language: newLang };
          }
          return f;
        });
        return {
          localFiles: updated,
          activeFileId: newPath,
          openTabs: state.openTabs.map(t => t === activeFileId ? newPath : t)
        };
      });
      await useProjectStore.getState().saveActiveFile();
    } else if (socket && activeProject) {
      socket.emit('file-rename', {
        projectId: activeProject._id,
        roomId: activeProject.roomId,
        fileId: activeFileId,
        newPath
      });
    }
  };

  // Version Commit handler
  const handleSaveVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !activeProject) return;
    socket.emit('save-version', { roomId: activeProject.roomId, commitMessage: commitMessage.trim() });
    setCommitMessage('');
  };

  const handleRestoreVersion = (versionId: string) => {
    if (!socket || !activeProject) return;
    if (confirm('Are you sure you want to restore workspace files to this version snapshot? All current unsaved changes will be overwritten.')) {
      socket.emit('restore-version', { roomId: activeProject.roomId, versionId });
    }
  };

  // Simulated Stepper Debugger Controls
  const startSimulatedDebugger = () => {
    const currentFiles: FileItem[] = isLocalWorkspace ? localFiles : (activeProject?.files || []);
    const file = currentFiles.find((f: FileItem) => f._id === activeFileId);
    if (!file) return;

    const steps = generateSimulatedDebugSteps(activeFileContent || file.content);
    if (steps.length === 0) {
      alert('Source file has no executable lines to debug.');
      return;
    }

    debugStepsRef.current = steps;
    
    const activeBreaks = breakpoints[activeFileId!] || [];
    let startIdx = 0;
    
    if (activeBreaks.length > 0) {
      const idx = steps.findIndex(s => activeBreaks.includes(s.line));
      if (idx !== -1) {
        startIdx = idx;
      }
    }

    debugStepIndexRef.current = startIdx;
    const step = steps[startIdx];
    
    setDebugActiveLine(step.line);
    setDebugVariables(step.variables);
    setDebugCallStack(step.callStack);
    setDebugState('paused');
    setSidebarTab('debugger');
  };

  const stepOverDebugger = () => {
    if (debugState !== 'paused' || debugStepsRef.current.length === 0) return;
    
    const nextIdx = debugStepIndexRef.current + 1;
    if (nextIdx < debugStepsRef.current.length) {
      debugStepIndexRef.current = nextIdx;
      const step = debugStepsRef.current[nextIdx];
      
      setDebugActiveLine(step.line);
      setDebugVariables(step.variables);
      setDebugCallStack(step.callStack);
    } else {
      stopDebugger();
    }
  };

  const continueDebugger = () => {
    if (debugState !== 'paused' || debugStepsRef.current.length === 0) return;

    const currentIdx = debugStepIndexRef.current;
    const activeBreaks = breakpoints[activeFileId!] || [];
    
    let foundIdx = -1;
    for (let i = currentIdx + 1; i < debugStepsRef.current.length; i++) {
      if (activeBreaks.includes(debugStepsRef.current[i].line)) {
        foundIdx = i;
        break;
      }
    }

    if (foundIdx !== -1) {
      debugStepIndexRef.current = foundIdx;
      const step = debugStepsRef.current[foundIdx];
      setDebugActiveLine(step.line);
      setDebugVariables(step.variables);
      setDebugCallStack(step.callStack);
    } else {
      stopDebugger();
      setTerminalOutput(prev => prev + '\n[SYSTEM] Simulated debug execution completed successfully.\n');
    }
  };

  const stopDebugger = () => {
    setDebugState('idle');
    setDebugActiveLine(null);
    setDebugVariables({});
    setDebugCallStack([]);
    debugStepsRef.current = [];
    debugStepIndexRef.current = 0;
  };

  const handleAddWatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWatchExpr.trim()) return;
    setWatchList(prev => [...prev, newWatchExpr.trim()]);
    setNewWatchExpr('');
  };

  const handleRemoveWatch = (index: number) => {
    setWatchList(prev => prev.filter((_, i) => i !== index));
  };

  // Build recursive directory layout components
  const filesSource: FileItem[] = isLocalWorkspace ? localFiles : (activeProject?.files || []);
  const treeRoot = buildTree(filesSource);

  const file = filesSource.find((f: FileItem) => f._id === activeFileId);
  const isWorkspaceOwner = activeProject?.owner?._id === user?.id;

  return (
    <div className="relative min-h-screen bg-[#1e1e1e] text-text flex flex-col h-screen select-none font-sans overflow-hidden">
      {/* 1. Header Navigation Bar */}
      <header className="h-11 border-b border-border bg-[#181818] flex items-center justify-between px-4 shrink-0 z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (isLocalWorkspace) {
                closeWorkspace();
              } else {
                navigate('/');
              }
            }}
            className="p-1 rounded hover:bg-border text-text-muted hover:text-white transition-all flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="h-4 w-[1px] bg-border" />
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-white">
              {isLocalWorkspace ? `${localWorkspaceName} (Local Workspace)` : activeProject?.projectName}
            </span>
          </div>
          
          {/* Invite Button (Opens Modal) */}
          {!isLocalWorkspace && activeProject && (
            <button
              onClick={() => {
                setInviteModalOpen(true);
                setGeneratedInviteLink('');
              }}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-border bg-background hover:bg-border text-[11px] font-bold text-text-muted hover:text-white transition-all"
            >
              <Share2 className="h-3.5 w-3.5" />
              Invite
            </button>
          )}

          {/* Active Collaborators Overlays */}
          {!isLocalWorkspace && collaborators.length > 0 && (
            <div className="flex -space-x-1.5 overflow-hidden ml-2 items-center">
              {collaborators.slice(0, 3).map(c => (
                <img
                  key={c.socketId}
                  src={c.avatar}
                  alt={c.username}
                  className="inline-block h-5 w-5 rounded-full border border-card ring-1 ring-white/10"
                  title={`${c.username} (${c.status})`}
                />
              ))}
              {collaborators.length > 3 && (
                <span className="flex items-center justify-center text-[8px] font-bold h-5 w-5 rounded-full bg-border text-text-muted border border-card">
                  +{collaborators.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Language Selector Dropdown */}
          {file && (
            <select
              value={file.language || 'javascript'}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-[#1e1e1e] border border-border text-text text-xs rounded px-2.5 py-1 outline-none font-sans font-bold cursor-pointer hover:border-primary/50"
            >
              <option value="java">Java</option>
              <option value="python">Python</option>
              <option value="c">C</option>
              <option value="cpp">C++</option>
              <option value="javascript">JavaScript</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
              <option value="kotlin">Kotlin</option>
            </select>
          )}
        </div>
      </header>

      {/* 2. Workspace Body Grid */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* Left Vertical Activity Bar */}
        <aside className="w-12 border-r border-border bg-[#181818] flex flex-col justify-between py-4 items-center shrink-0">
          <div className="space-y-4">
            <button 
              onClick={() => setSidebarTab('explorer')}
              title="File Explorer"
              className={`p-2 rounded transition-all ${sidebarTab === 'explorer' ? 'text-primary bg-primary/10' : 'text-text-dark hover:text-white'}`}
            >
              <FileText className="h-5 w-5" />
            </button>
            <button 
              onClick={() => setSidebarTab('debugger')}
              title="Run & Debug"
              className={`p-2 rounded transition-all ${sidebarTab === 'debugger' ? 'text-primary bg-primary/10' : 'text-text-dark hover:text-white'}`}
            >
              <Bug className="h-5 w-5" />
            </button>
            {!isLocalWorkspace && (
              <>
                <button 
                  onClick={() => setSidebarTab('collaborators')}
                  title="Collaborators"
                  className={`p-2 rounded transition-all ${sidebarTab === 'collaborators' ? 'text-primary bg-primary/10' : 'text-text-dark hover:text-white'}`}
                >
                  <Users className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setSidebarTab('versions')}
                  title="Version History"
                  className={`p-2 rounded transition-all ${sidebarTab === 'versions' ? 'text-primary bg-primary/10' : 'text-text-dark hover:text-white'}`}
                >
                  <History className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setSidebarTab('timeline')}
                  title="Activity Timeline"
                  className={`p-2 rounded transition-all ${sidebarTab === 'timeline' ? 'text-primary bg-primary/10' : 'text-text-dark hover:text-white'}`}
                >
                  <Clock className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
          <div className="space-y-4">
            <button className="p-2 rounded text-text-dark hover:text-white transition-all" title="Settings">
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </aside>

        {/* Left Sidebar Drawer Panel */}
        <aside className="w-60 border-r border-border bg-[#181818] flex flex-col shrink-0 select-none relative">
          
          {/* Explorer Panel */}
          {sidebarTab === 'explorer' && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="p-3 border-b border-border flex items-center justify-between shrink-0 bg-[#181818]">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Explorer</span>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => handleCreateItem('', false)} 
                    title="New File"
                    className="p-1 hover:bg-border rounded text-text-dark hover:text-white"
                  >
                    <FilePlus className="h-3.5 w-3.5" />
                  </button>
                  <button 
                    onClick={() => handleCreateItem('', true)} 
                    title="New Folder"
                    className="p-1 hover:bg-border rounded text-text-dark hover:text-white"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {isLocalWorkspace ? (
                  <div className="mb-3 px-2 py-1 bg-border/20 rounded border border-border/50 text-[10px] flex items-center justify-between">
                    <span className="text-text-muted truncate mr-1">Local Workspace Active</span>
                    <button onClick={closeWorkspace} className="hover:text-red-400 font-bold shrink-0" title="Close Workspace">Close</button>
                  </div>
                ) : (
                  <button 
                    onClick={handleOpenLocalFolder}
                    className="w-full mb-3 py-1 px-2 border border-border border-dashed hover:border-primary rounded text-center text-xs text-text-muted hover:text-white transition-all bg-card flex items-center justify-center gap-1"
                  >
                    <FolderOpen className="h-3.5 w-3.5 text-primary" />
                    Open Local Folder
                  </button>
                )}

                {filesSource.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-text-dark">
                    Workspace is empty.<br />
                    Create a file to begin.
                  </div>
                ) : (
                  <RenderTree 
                    node={treeRoot} 
                    depth={0} 
                    activeFileId={activeFileId}
                    expandedFolders={expandedFolders}
                    toggleFolder={toggleFolder}
                    onSelectFile={setActiveFileId}
                    onCreateItem={handleCreateItem}
                    onRenameItem={handleRenameItem}
                    onDeleteItem={handleDeleteItem}
                    onDuplicateItem={handleDuplicateItem}
                    onContextMenu={handleContextMenu}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                )}
              </div>
            </div>
          )}

          {/* Stepper Debugger Side Panel */}
          {sidebarTab === 'debugger' && (
            <div className="flex flex-col flex-1 min-h-0 bg-[#181818]">
              <div className="p-3 border-b border-border flex items-center justify-between bg-[#181818] shrink-0">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Run & Debug</span>
                <div className="flex items-center gap-1 bg-[#1e1e1e] p-0.5 rounded border border-border">
                  {debugState === 'idle' ? (
                    <button 
                      onClick={startSimulatedDebugger}
                      disabled={!activeFileId}
                      className="p-1 text-accent hover:bg-border rounded disabled:opacity-50"
                      title="Start Debugging"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={continueDebugger}
                        className="p-1 text-primary hover:bg-border rounded"
                        title="Continue (F5)"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </button>
                      <button 
                        onClick={stepOverDebugger}
                        className="p-1 text-amber-400 hover:bg-border rounded"
                        title="Step Over (F10)"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button 
                        onClick={stopDebugger}
                        className="p-1 text-red-400 hover:bg-border rounded"
                        title="Stop Debugging"
                      >
                        <Square className="h-3.5 w-3.5 fill-current" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-4">
                <div className="text-[10px] bg-[#1e1e1e] border border-border p-2 rounded">
                  <span className="font-bold text-text-muted block uppercase tracking-wider text-[8px]">Debugger Status</span>
                  <span className={`font-semibold ${debugState === 'paused' ? 'text-amber-400' : 'text-text-dark'}`}>
                    {debugState === 'paused' ? `Paused on Line ${debugActiveLine}` : 'Debugger Idle'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-text-muted block uppercase tracking-wider">Variables</span>
                  <div className="bg-[#1e1e1e] border border-border rounded p-2 text-xs font-mono max-h-48 overflow-y-auto space-y-1">
                    {Object.keys(debugVariables).length === 0 ? (
                      <span className="text-[10px] text-text-dark italic">No local scope variables.</span>
                    ) : (
                      Object.entries(debugVariables).map(([key, val]) => (
                        <div key={key} className="flex justify-between border-b border-border/20 pb-0.5">
                          <span className="text-primary-hover font-semibold">{key}</span>
                          <span className="text-amber-400">{JSON.stringify(val)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-text-muted block uppercase tracking-wider">Watch List</span>
                  <form onSubmit={handleAddWatch} className="flex gap-1">
                    <input 
                      type="text" 
                      placeholder="Expression..."
                      value={newWatchExpr}
                      onChange={(e) => setNewWatchExpr(e.target.value)}
                      className="flex-1 bg-[#1e1e1e] border border-border rounded px-2 py-0.5 text-xs text-white outline-none focus:border-primary"
                    />
                    <button type="submit" className="p-1 bg-[#1e1e1e] border border-border hover:bg-border rounded text-white">
                      <Plus className="h-3 w-3" />
                    </button>
                  </form>
                  <div className="bg-[#1e1e1e] border border-border rounded p-2 text-xs font-mono space-y-1 max-h-36 overflow-y-auto">
                    {watchList.length === 0 ? (
                      <span className="text-[10px] text-text-dark italic">No watch variables.</span>
                    ) : (
                      watchList.map((expr, i) => {
                        const evalVal = evaluateWatchExpression(expr, debugVariables);
                        return (
                          <div key={i} className="flex justify-between items-center group">
                            <span className="text-text-muted truncate mr-2" title={expr}>{expr}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-amber-400 font-semibold">{evalVal}</span>
                              <button 
                                onClick={() => handleRemoveWatch(i)}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-text-dark hover:text-red-400"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-text-muted block uppercase tracking-wider">Call Stack</span>
                  <div className="bg-[#1e1e1e] border border-border rounded p-2 text-xs font-mono space-y-1 max-h-24 overflow-y-auto">
                    {debugCallStack.length === 0 ? (
                      <span className="text-[10px] text-text-dark italic">Stack trace empty.</span>
                    ) : (
                      debugCallStack.map((frame, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-text-muted">
                          <span className="text-text-dark font-bold">•</span>
                          <span>{frame}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold text-text-muted block uppercase tracking-wider">Breakpoints</span>
                  <div className="bg-[#1e1e1e] border border-border rounded p-2 text-xs font-mono space-y-1.5 max-h-32 overflow-y-auto">
                    {!activeFileId || !breakpoints[activeFileId] || breakpoints[activeFileId].length === 0 ? (
                      <span className="text-[10px] text-text-dark italic">No breakpoints set. Click margin to set.</span>
                    ) : (
                      breakpoints[activeFileId].map((lineNum) => (
                        <div key={lineNum} className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-400 shrink-0" />
                          <span className="text-text-muted truncate">Line {lineNum}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Collaborators List Panel */}
          {sidebarTab === 'collaborators' && !isLocalWorkspace && (
            <div className="flex flex-col flex-1 min-h-0 bg-[#181818]">
              <div className="p-3 border-b border-border bg-[#181818] shrink-0">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Collaborators ({collaborators.length + 1})</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Me */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={user.avatar} alt={user.username} className="h-6 w-6 rounded border border-border" />
                    <span className="text-xs font-semibold text-white">{user.username} (You)</span>
                  </div>
                  <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 uppercase">
                    {isWorkspaceOwner ? 'Owner' : 'Member'}
                  </span>
                </div>
                {/* Others */}
                {collaborators.map(c => (
                  <div key={c.socketId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-all">
                      <img src={c.avatar} alt={c.username} className="h-6 w-6 rounded border border-border" />
                      <div className="text-[10px]">
                        <span className="font-semibold text-white block leading-none">{c.username}</span>
                        {c.currentFile && <span className="text-[8px] text-text-dark">Editing {c.currentFile.split('/').pop()}</span>}
                      </div>
                    </div>
                    <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase ${
                      c.isOwner 
                        ? 'bg-primary/20 text-primary border border-primary/30' 
                        : 'bg-border text-text-muted border border-border/50'
                    }`}>
                      {c.isOwner ? 'Owner' : 'Member'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Versions History Panel */}
          {sidebarTab === 'versions' && !isLocalWorkspace && (
            <div className="flex flex-col flex-1 min-h-0 bg-[#181818]">
              <div className="p-3 border-b border-border flex items-center justify-between shrink-0 bg-[#181818]">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Version History</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans">
                {/* Create Version Form */}
                <form onSubmit={handleSaveVersion} className="space-y-2 bg-[#1e1e1e] p-2.5 rounded border border-border">
                  <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">Commit Version</span>
                  <input 
                    type="text" 
                    placeholder="Commit message..."
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="w-full bg-[#0a0a0d] border border-border rounded px-2 py-1 text-xs text-white outline-none"
                  />
                  <button type="submit" className="w-full py-1 bg-primary hover:bg-primary-hover rounded text-[10px] font-bold text-white transition-all">
                    Save Version Snapshot
                  </button>
                </form>

                {/* Versions List */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {versionsLoading ? (
                    <span className="text-[10px] text-text-dark italic animate-pulse">Loading history...</span>
                  ) : versions.length === 0 ? (
                    <span className="text-[10px] text-text-dark italic">No version history yet.</span>
                  ) : (
                    versions.map((ver) => (
                      <div key={ver._id} className="bg-[#1e1e1e] border border-border p-2 rounded text-xs space-y-1.5">
                        <div className="flex justify-between font-bold text-[10px] text-primary">
                          <span>Version #{ver.versionNumber}</span>
                          <span className="text-text-dark">{new Date(ver.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p className="text-[11px] text-text truncate">{ver.commitMessage}</p>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-text-muted">By {ver.user?.username || 'user'}</span>
                          <button 
                            onClick={() => handleRestoreVersion(ver._id)}
                            className="px-2 py-0.5 bg-border hover:bg-border/80 text-white rounded font-bold transition-all text-[9px]"
                          >
                            Restore
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Activity Timeline Panel */}
          {sidebarTab === 'timeline' && !isLocalWorkspace && (
            <div className="flex flex-col flex-1 min-h-0 bg-[#181818]">
              <div className="p-3 border-b border-border flex items-center justify-between shrink-0 bg-[#181818]">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Activity Timeline</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans">
                {activities.length === 0 ? (
                  <span className="text-[10px] text-text-dark italic">No activities logged yet.</span>
                ) : (
                  activities.map((act) => (
                    <div key={act._id} className="flex gap-2 border-b border-border/20 pb-2">
                      <img 
                        src={act.user?.avatar} 
                        alt="" 
                        className="h-5 w-5 rounded border border-border mt-0.5 shrink-0" 
                      />
                      <div className="text-[11px] min-w-0">
                        <span className="font-bold text-white mr-1">{act.user?.username || 'User'}</span>
                        <span className="text-text-muted">{act.details || act.type}</span>
                        <span className="text-[9px] text-text-dark block mt-0.5">{new Date(act.createdAt).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Floating Context Menu */}
          {contextMenu.visible && (
            <div 
              className="fixed bg-[#181818] border border-border rounded shadow-lg py-1 z-50 text-xs w-36 font-sans select-none glass-panel"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              {contextMenu.node.isFolder ? (
                <>
                  <div className="px-3 py-1.5 hover:bg-border cursor-pointer flex items-center gap-1.5" onClick={() => handleCreateItem(contextMenu.node.path, false)}>
                    <FilePlus className="h-3.5 w-3.5 text-text-muted" /> New File
                  </div>
                  <div className="px-3 py-1.5 hover:bg-border cursor-pointer flex items-center gap-1.5" onClick={() => handleCreateItem(contextMenu.node.path, true)}>
                    <FolderPlus className="h-3.5 w-3.5 text-text-muted" /> New Folder
                  </div>
                  <div className="border-t border-border my-1" />
                </>
              ) : null}
              {contextMenu.node.fileId && (
                <>
                  <div className="px-3 py-1.5 hover:bg-border cursor-pointer flex items-center gap-1.5" onClick={() => handleRenameItem(contextMenu.node.fileId!, contextMenu.node.path)}>
                    <Edit className="h-3.5 w-3.5 text-text-muted" /> Rename
                  </div>
                  <div className="px-3 py-1.5 hover:bg-border cursor-pointer flex items-center gap-1.5" onClick={() => handleDuplicateItem(contextMenu.node.fileId!)}>
                    <Copy className="h-3.5 w-3.5 text-text-muted" /> Duplicate
                  </div>
                  <div className="border-t border-border my-1" />
                  <div className="px-3 py-1.5 hover:bg-border cursor-pointer flex items-center gap-1.5 text-red-400 hover:text-red-300" onClick={() => handleDeleteItem(contextMenu.node.fileId!)}>
                    <Trash className="h-3.5 w-3.5" /> Delete
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bottom active state indicator */}
          <div className="p-2 border-t border-border bg-[#181818] text-[9px] text-text-muted flex gap-2">
            <Cpu className="h-3.5 w-3.5 text-text-dark shrink-0" />
            <span>Presence synchronizer active.</span>
          </div>
        </aside>

        {/* Center Panel (Tabs + Breadcrumbs + Editor + Panel) */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#1e1e1e]">
          {/* Horizontally scrolling tab layout */}
          {openTabs.length > 0 && (
            <div className="flex bg-[#181818] border-b border-border overflow-x-auto shrink-0 select-none">
              {openTabs.map((tabId) => {
                const tabFile = isLocalWorkspace 
                  ? localFiles.find((f: FileItem) => f._id === tabId)
                  : activeProject?.files.find((f: FileItem) => f._id === tabId);
                
                if (!tabFile) return null;
                
                const isTabActive = activeFileId === tabId;
                const isUnsaved = useProjectStore.getState().unsavedFiles[tabId];
                
                return (
                  <div
                    key={tabId}
                    className={`group flex items-center gap-2 px-3 py-1.5 border-r border-border cursor-pointer text-xs transition-all relative ${
                      isTabActive ? 'bg-[#1e1e1e] text-white font-semibold' : 'text-text-muted hover:bg-[#252526] hover:text-white'
                    }`}
                    onClick={() => setActiveFileId(tabId)}
                  >
                    {isTabActive && <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />}
                    {getFileIcon(tabFile.path)}
                    <span className="truncate max-w-[120px]">
                      {(tabFile.path || (tabFile as any).name || 'untitled').split('/').pop()}
                    </span>
                    
                    {/* Close button & Unsaved marker */}
                    <div 
                      className="flex items-center justify-center w-4 h-4 rounded hover:bg-border text-text-dark hover:text-white shrink-0"
                      onClick={(e) => { e.stopPropagation(); closeTab(tabId); }}
                    >
                      {isUnsaved ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary block group-hover:hidden" />
                      ) : null}
                      <X className={`h-3 w-3 ${isUnsaved ? 'hidden group-hover:block' : 'block'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Breadcrumbs Bar */}
          {file && (
            <div className="h-6 bg-[#181818] border-b border-border flex items-center px-4 text-[10px] text-text-dark gap-1 select-none font-mono shrink-0">
              <FolderOpen className="h-3 w-3 text-text-dark" />
              <span>{isLocalWorkspace ? localWorkspaceName : activeProject?.name}</span>
              {(file.path || (file as any).name || 'untitled').split('/').map((part: string, i: number) => (
                <span key={i} className="flex items-center gap-1">
                  <ChevronRight className="h-2.5 w-2.5" />
                  <span className={i === (file.path || (file as any).name || 'untitled').split('/').length - 1 ? "text-text-muted font-bold" : ""}>{part}</span>
                </span>
              ))}
            </div>
          )}

          {/* Editor Workspace */}
          <div className="flex-1 min-h-0 flex flex-col">
            <CollaborativeEditor 
              socket={socket} 
              debugActiveLine={debugActiveLine}
              diagnostics={diagnostics}
              isRunning={isRunning}
              onRunCode={handleRunCode}
              onStopCode={handleStopCode}
              parentEditorRef={editorRef}
            />
          </div>

          {/* Bottom Resizable Panel (VS Code Style) */}
          <div className="h-52 border-t border-border bg-[#181818] flex flex-col shrink-0">
            {/* Tabs header */}
            <div className="border-b border-border bg-[#181818] px-4 py-1.5 flex items-center justify-between shrink-0 h-9">
              <div className="flex gap-4">
                <button 
                  onClick={() => setActiveConsoleTab('terminal')}
                  className={`text-[10px] font-bold transition-all relative py-1 ${activeConsoleTab === 'terminal' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
                >
                  TERMINAL
                  {activeConsoleTab === 'terminal' && <div className="absolute bottom-[-7px] left-0 right-0 h-[2px] bg-primary" />}
                </button>
                <button 
                  onClick={() => setActiveConsoleTab('problems')}
                  className={`text-[10px] font-bold transition-all relative py-1 flex items-center gap-1 ${activeConsoleTab === 'problems' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
                >
                  PROBLEMS
                  {diagnostics.length > 0 && (
                    <span className="h-4 px-1 rounded bg-red-400/20 text-red-400 font-bold text-[9px] min-w-4 flex items-center justify-center shrink-0">
                      {diagnostics.length}
                    </span>
                  )}
                  {activeConsoleTab === 'problems' && <div className="absolute bottom-[-7px] left-0 right-0 h-[2px] bg-primary" />}
                </button>
                <button 
                  onClick={() => setActiveConsoleTab('output')}
                  className={`text-[10px] font-bold transition-all relative py-1 ${activeConsoleTab === 'output' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
                >
                  OUTPUT
                  {activeConsoleTab === 'output' && <div className="absolute bottom-[-7px] left-0 right-0 h-[2px] bg-primary" />}
                </button>
                <button 
                  onClick={() => setActiveConsoleTab('debug')}
                  className={`text-[10px] font-bold transition-all relative py-1 ${activeConsoleTab === 'debug' ? 'text-primary' : 'text-text-muted hover:text-white'}`}
                >
                  DEBUG CONSOLE
                  {activeConsoleTab === 'debug' && <div className="absolute bottom-[-7px] left-0 right-0 h-[2px] bg-primary" />}
                </button>
              </div>

              <div className="flex items-center gap-3">
                {file && (
                  <button 
                    onClick={handleSaveAs}
                    className="px-2 py-0.5 rounded border border-border text-[9px] hover:bg-border text-text-muted hover:text-white transition-all"
                    title="Save Active File As..."
                  >
                    Save As...
                  </button>
                )}
                <label className="flex items-center gap-1.5 cursor-pointer text-[9px] text-text-muted" title="Toggle Auto Save (5s)">
                  <input 
                    type="checkbox" 
                    checked={autoSaveEnabled} 
                    onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                    className="rounded bg-[#1e1e1e] border-border text-primary focus:ring-0 h-3 w-3"
                  />
                  Auto Save
                </label>
                {(executionTime !== null || executionMemory !== null) && (
                  <div className="text-[9px] text-text-muted flex gap-2 font-mono border-l border-border pl-2.5">
                    {executionTime !== null && <span>Time: {executionTime.toFixed(3)}s</span>}
                    {executionMemory !== null && <span>Memory: {executionMemory} KB</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Console content display */}
            <div className="flex-1 flex min-h-0 bg-[#1e1e1e]">
              {/* TERMINAL TAB */}
              {activeConsoleTab === 'terminal' && (
                <div className="flex-1 flex flex-col min-h-0 p-3 bg-[#1e1e1e] font-mono text-[11px] leading-relaxed relative">
                  <pre className="flex-1 overflow-y-auto whitespace-pre-wrap select-text scrollbar-thin scroll-smooth pb-6">
                    {terminalOutput}
                    <div ref={terminalEndRef} />
                  </pre>

                  {isRunning && (
                    <form onSubmit={handleTerminalSubmit} className="absolute bottom-0 left-0 right-0 h-8 px-3 border-t border-border/30 bg-[#1e1e1e] flex items-center gap-1.5 shrink-0 z-10">
                      <span className="text-accent font-bold font-mono">stdin &gt;</span>
                      <input
                        type="text"
                        value={terminalInput}
                        onChange={(e) => setTerminalInput(e.target.value)}
                        className="flex-1 bg-transparent text-white outline-none border-none p-0 font-mono text-[11px]"
                        placeholder="Type program input and press Enter..."
                        autoFocus
                      />
                    </form>
                  )}
                </div>
              )}

              {/* PROBLEMS TAB */}
              {activeConsoleTab === 'problems' && (
                <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed bg-[#1e1e1e] space-y-1.5">
                  {diagnostics.length === 0 ? (
                    <div className="text-text-muted flex gap-1.5 items-center">
                      <Check className="h-4 w-4 text-accent" />
                      <span>No syntax errors or compilation problems reported.</span>
                    </div>
                  ) : (
                    diagnostics.map((diag, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-start gap-2 text-red-400 hover:underline cursor-pointer py-0.5"
                        onClick={() => {
                          if (editorRef.current) {
                            editorRef.current.revealLineInCenter(diag.line);
                            editorRef.current.setPosition({ lineNumber: diag.line, column: 1 });
                            editorRef.current.focus();
                          }
                        }}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400 mt-0.5" />
                        <span>
                          <strong>Line {diag.line}:</strong> {diag.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* OUTPUT TAB */}
              {activeConsoleTab === 'output' && (
                <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-text-muted bg-[#1e1e1e]">
                  {isRunning ? '[SYSTEM] Spawning runner thread...' : '[SYSTEM] Output console stream is active.'}
                </div>
              )}

              {/* DEBUG TAB */}
              {activeConsoleTab === 'debug' && (
                <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-text-muted bg-[#1e1e1e] space-y-1">
                  <div>Debug Console session active.</div>
                  {debugState === 'paused' && (
                    <div className="text-amber-400">
                      * Paused at execution trace frame line {debugActiveLine}.
                      Watch values: {watchList.map(w => `${w}=${evaluateWatchExpression(w, debugVariables)}`).join(', ') || 'none'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Live Chat Drawer */}
        <aside className="w-72 border-l border-border bg-[#181818] flex flex-col shrink-0">
          <div className="flex-1 flex flex-col min-h-0 border-b border-border">
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center justify-between bg-[#181818] shrink-0">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-primary" />
                Live Chat
              </h3>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-border text-text-muted">
                • {collaborators.length + 1}
              </span>
            </div>

            {/* Chat messages list starts empty */}
            <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-[#1e1e1e]">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-dark text-center px-4">
                  <MessageSquare className="h-10 w-10 text-border mb-2" />
                  <p className="text-[11px]">No messages yet. Send a message to start.</p>
                </div>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <img 
                        src={msg.sender.avatar} 
                        alt={msg.sender.username} 
                        className="h-5 w-5 rounded border border-border"
                      />
                      <span className="text-[11px] font-bold text-white">{msg.sender.username}</span>
                      <span className="text-[9px] text-text-dark">{msg.timestamp}</span>
                    </div>
                    <div className="text-[11px] text-text-muted leading-relaxed pl-7 break-words pr-2">
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Message Input bar */}
            <form onSubmit={handleSendMessage} className="p-2 border-t border-border bg-[#181818] flex gap-1.5 shrink-0">
              <input
                type="text"
                placeholder="Type a message..."
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                className="flex-1 bg-[#1e1e1e] border border-border focus:border-primary/50 rounded py-1.5 px-2.5 text-xs text-white placeholder-text-dark outline-none transition-all"
              />
              <button
                type="submit"
                className="p-1.5 rounded bg-primary text-white hover:bg-primary-hover active:scale-95 transition-all"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>

          {/* Online Members panel */}
          <div className="h-44 p-3 flex flex-col min-h-0 bg-[#181818] overflow-y-auto">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
              <Users className="h-4 w-4 text-primary" />
              Online Members
            </h3>
            <div className="space-y-2.5">
              {user && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={user.avatar} alt={user.username} className="h-6 w-6 rounded border border-border" />
                    <div className="text-[11px]">
                      <span className="font-bold text-white block">{user.username} (You)</span>
                      {file && <span className="text-[9px] text-text-dark leading-none">Editing {file.path.split('/').pop()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-extrabold px-1 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 uppercase">
                      {isWorkspaceOwner ? 'Owner' : 'Member'}
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow-cyan" />
                  </div>
                </div>
              )}
              
              {collaborators.map(c => {
                const isTyping = typingUsers[c.socketId];
                return (
                  <div key={c.socketId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img src={c.avatar} alt={c.username} className="h-6 w-6 rounded border border-border" />
                      <div className="text-[11px]">
                        <span className="font-bold text-white block">{c.username}</span>
                        <span className="text-[9px] text-text-dark leading-none">
                          {isTyping ? 'Typing...' : c.status === 'idle' ? 'Idle' : 'Online'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] font-extrabold px-1 py-0.5 rounded bg-border text-text-muted border border-border/50 uppercase">
                        {c.isOwner ? 'Owner' : 'Member'}
                      </span>
                      <span className={`h-1.5 w-1.5 rounded-full ${c.status === 'idle' ? 'bg-amber-400 shadow-glow-amber' : 'bg-accent shadow-glow-cyan'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* Invite Modal Dialog */}
      <AnimatePresence>
        {inviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInviteModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm p-6 rounded-2xl glass-panel-heavy border border-white/5 shadow-premium z-10 text-text bg-[#181818]"
            >
              <button 
                onClick={() => setInviteModalOpen(false)}
                className="absolute top-4 right-4 p-1 rounded-lg text-text-muted hover:text-white hover:bg-border transition-all"
              >
                <X className="h-4 w-4" />
              </button>
              
              <h2 className="text-sm font-bold text-white mb-1 uppercase tracking-wider flex items-center gap-1.5">
                <Share2 className="h-4 w-4 text-primary" />
                Invite Collaborators
              </h2>
              <p className="text-xs text-text-muted mb-4">Workspace: <strong className="text-white">{activeProject?.projectName}</strong></p>
              
              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">Invite Link</label>
                  {generatedInviteLink ? (
                    <div className="flex gap-1">
                      <input 
                        type="text" 
                        readOnly 
                        value={generatedInviteLink} 
                        className="flex-1 bg-[#0a0a0d] border border-border rounded px-2.5 py-1.5 text-xs text-white outline-none"
                      />
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(generatedInviteLink);
                          showToast('Invite link copied!');
                        }}
                        className="px-3 bg-primary hover:bg-primary-hover rounded text-white font-bold"
                      >
                        Copy
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={handleGenerateInviteLink}
                      className="w-full py-1.5 bg-primary hover:bg-primary-hover rounded text-white font-bold active:scale-95 transition-all"
                    >
                      Generate Invite Link
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">Permission</label>
                    <select 
                      value={invitePermission}
                      onChange={(e) => {
                        setInvitePermission(e.target.value as any);
                        setGeneratedInviteLink(''); // Reset on change
                      }}
                      className="w-full bg-[#0a0a0d] border border-border rounded px-2.5 py-1.5 text-white outline-none cursor-pointer"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">Expiry</label>
                    <select 
                      value={inviteExpiry}
                      onChange={(e) => {
                        setInviteExpiry(e.target.value as any);
                        setGeneratedInviteLink(''); // Reset on change
                      }}
                      className="w-full bg-[#0a0a0d] border border-border rounded px-2.5 py-1.5 text-white outline-none cursor-pointer"
                    >
                      <option value="Never">Never</option>
                      <option value="1 Hour">1 Hour</option>
                      <option value="24 Hours">24 Hours</option>
                    </select>
                  </div>
                </div>

                {generatedInviteLink && (
                  <button 
                    onClick={handleGenerateInviteLink}
                    className="w-full py-1 bg-border/40 hover:bg-border rounded text-[11px] text-text hover:text-white transition-all font-semibold mt-2"
                  >
                    Generate New Link
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Tree view renderer recursive helper
interface TreeItemProps {
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  expandedFolders: Record<string, boolean>;
  toggleFolder: (path: string) => void;
  onSelectFile: (fileId: string) => void;
  onCreateItem: (parentPath: string, isFolder: boolean) => void;
  onRenameItem: (fileId: string, currentPath: string) => void;
  onDeleteItem: (fileId: string) => void;
  onDuplicateItem: (fileId: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  onDragStart: (e: React.DragEvent, node: TreeNode) => void;
  onDragOver: (e: React.DragEvent, node: TreeNode) => void;
  onDrop: (e: React.DragEvent, targetNode: TreeNode) => void;
}

function RenderTree({ 
  node, 
  depth, 
  activeFileId, 
  expandedFolders, 
  toggleFolder, 
  onSelectFile, 
  onCreateItem, 
  onRenameItem, 
  onDeleteItem,
  onDuplicateItem,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop
}: TreeItemProps) {
  if (!node.children) return null;

  const childrenList = Object.values(node.children).sort((a, b) => {
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex flex-col">
      {childrenList.map((child) => {
        const isExpanded = expandedFolders[child.path];
        const isSelected = activeFileId === child.fileId;

        return (
          <div key={child.path} className="flex flex-col">
            <div 
              className={`group flex items-center justify-between text-xs py-1 px-1.5 hover:bg-border/30 cursor-pointer rounded select-none ${
                isSelected ? 'bg-primary/20 text-white font-semibold' : 'text-text-muted hover:text-white'
              }`}
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
              draggable={true}
              onDragStart={(e) => onDragStart(e, child)}
              onDragOver={(e) => onDragOver(e, child)}
              onDrop={(e) => onDrop(e, child)}
              onContextMenu={(e) => onContextMenu(e, child)}
              onClick={() => {
                if (child.isFolder) {
                  toggleFolder(child.path);
                } else if (child.fileId) {
                  onSelectFile(child.fileId);
                }
              }}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {child.isFolder ? (
                  <>
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-text-dark shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-text-dark shrink-0" />
                    )}
                    <Folder className="h-3.5 w-3.5 text-primary shrink-0 fill-primary/10" />
                  </>
                ) : (
                  getFileIcon(child.name)
                )}
                <span className="truncate">{child.name}</span>
              </div>

              {/* Hover actions */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                {child.isFolder && (
                  <>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onCreateItem(child.path, false); }} 
                      title="New File"
                      className="p-0.5 hover:bg-border rounded text-text-dark hover:text-white"
                    >
                      <FilePlus className="h-3 w-3" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onCreateItem(child.path, true); }} 
                      title="New Folder"
                      className="p-0.5 hover:bg-border rounded text-text-dark hover:text-white"
                    >
                      <FolderPlus className="h-3 w-3" />
                    </button>
                  </>
                )}
                {child.fileId && (
                  <>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onRenameItem(child.fileId!, child.path); }} 
                      title="Rename"
                      className="p-0.5 hover:bg-border rounded text-text-dark hover:text-white"
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDuplicateItem(child.fileId!); }} 
                      title="Duplicate"
                      className="p-0.5 hover:bg-border rounded text-text-dark hover:text-white"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteItem(child.fileId!); }} 
                      title="Delete"
                      className="p-0.5 hover:bg-border rounded text-text-dark hover:text-red-400"
                    >
                      <Trash className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {child.isFolder && isExpanded && (
              <RenderTree 
                node={child} 
                depth={depth + 1} 
                activeFileId={activeFileId}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onSelectFile={onSelectFile}
                onCreateItem={onCreateItem}
                onRenameItem={onRenameItem}
                onDeleteItem={onDeleteItem}
                onDuplicateItem={onDuplicateItem}
                onContextMenu={onContextMenu}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
