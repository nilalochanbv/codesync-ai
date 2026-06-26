import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectStore } from '../store/useProjectStore';
import { useAuthStore } from '../store/useAuthStore';
import { 
  FolderKanban, Plus, Search, FolderOpen, Trash2, 
  UserPlus, X, LogOut, Terminal, Users, Code, ArrowRight, ShieldCheck 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardProps {}

export default function Dashboard({}: DashboardProps) {
  const { user, logout } = useAuthStore();
  const { 
    projects, fetchProjects, createProject, deleteProject, inviteCollaborator, isLoading 
  } = useProjectStore();
  const navigate = useNavigate();

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Form states
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('public');
  const [inviteeText, setInviteeText] = useState('');
  
  // Local error/success messages
  const [modalError, setModalError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      setModalError('Workspace name is required');
      return;
    }
    setModalError(null);
    try {
      const ws = await createProject({
        projectName: newProjectName.trim(),
        description: newProjectDesc.trim(),
        visibility
      });
      // Reset form
      setNewProjectName('');
      setNewProjectDesc('');
      setVisibility('public');
      setIsCreateOpen(false);
      navigate(`/room/${ws.roomId}`);
    } catch (err: any) {
      setModalError(err.message || 'Failed to create workspace');
    }
  };

  const handleInviteCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteeText.trim() || !selectedProjectId) return;
    setModalError(null);
    setInviteSuccess(null);
    try {
      await inviteCollaborator(selectedProjectId, inviteeText.trim());
      setInviteSuccess(`Successfully invited collaborator!`);
      setInviteeText('');
      // Keep open short to display success, then close
      setTimeout(() => {
        setIsInviteOpen(false);
        setInviteSuccess(null);
        setSelectedProjectId(null);
      }, 1500);
    } catch (err: any) {
      setModalError(err.message || 'Collaborator invite failed');
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering open project
    if (confirm('Are you sure you want to delete this project? This action is permanent.')) {
      try {
        await deleteProject(projectId);
      } catch (err) {
        alert(err || 'Failed to delete project');
      }
    }
  };

  // Filter project cards
  const filteredProjects = projects.filter(project => 
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description.toLowerCase().includes(searchQuery.toLowerCase())
  );



  return (
    <div className="flex h-screen bg-[#070709] text-text select-none overflow-hidden">
      {/* 1. Sidebar Navigation */}
      <aside className="w-64 border-r border-border bg-card flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Header */}
          <div className="p-6 border-b border-border flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-primary to-secondary p-[1px] shadow-glow-purple">
              <div className="w-full h-full bg-[#0c0c0f] rounded-lg flex items-center justify-center">
                <FolderKanban className="h-4.5 w-4.5 text-primary" />
              </div>
            </div>
            <span className="font-extrabold text-white text-base tracking-tight">CodeSync AI</span>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            <a href="#projects" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-border text-white text-xs font-semibold tracking-wide">
              <FolderKanban className="h-4 w-4 text-primary" />
              Projects
            </a>
            <div className="px-3 py-2 text-[10px] text-text-dark font-extrabold tracking-wider uppercase mt-4">Workspace Info</div>
            <div className="flex items-center justify-between px-3 py-2 text-xs text-text-muted">
              <span className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-text-dark" />
                Active Projects
              </span>
              <span className="font-mono bg-border px-1.5 py-0.5 rounded text-[10px] text-white">{projects.length}</span>
            </div>
          </nav>
        </div>

        {/* Profile Footer */}
        {user && (
          <div className="p-4 border-t border-border flex items-center justify-between gap-3 bg-[#0a0a0d]">
            <div className="flex items-center gap-2.5 min-w-0">
              <img 
                src={user.avatar} 
                alt={user.username} 
                className="h-8 w-8 rounded-lg border border-white/5 bg-[#121217] shrink-0"
              />
              <div className="min-w-0 flex flex-col">
                <span className="text-xs font-bold text-white truncate leading-tight">{user.username}</span>
                <span className="text-[10px] text-text-muted truncate mt-0.5">{user.email}</span>
              </div>
            </div>
            <button 
              onClick={logout}
              className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
              title="Logout Session"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>

      {/* 2. Main Content Board */}
      <main className="flex-1 flex flex-col overflow-y-auto relative bg-background">
        {/* Top Board Toolbar */}
        <header className="p-6 border-b border-border flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card sticky top-0 z-30">
          <div>
            <h2 className="text-xl font-extrabold text-white tracking-tight">Developer Projects</h2>
            <p className="text-xs text-text-muted mt-1 font-medium">Select a shared room workspace or initialize a new project sandbox.</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-dark" />
              <input
                type="text"
                placeholder="Filter workspaces..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 md:w-64 bg-[#0c0c0f] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-text-dark outline-none transition-all"
              />
            </div>

            {/* Create Project Button */}
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 py-2 px-3.5 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-white text-xs font-semibold shadow-glow-purple active:scale-95 transition-all"
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>
          </div>
        </header>

        {/* Dynamic Grid Body */}
        <div className="p-6 flex-1">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Plus className="h-6 w-6 text-primary animate-spin" />
                <span className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">Retrieving sync records...</span>
              </div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="h-96 flex flex-col items-center justify-center text-center border border-dashed border-border rounded-2xl p-8"
            >
              <div className="h-12 w-12 rounded-xl bg-card border border-border flex items-center justify-center text-text-dark mb-4">
                <Terminal className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-white">No Sandboxes Found</h3>
              <p className="text-xs text-text-muted max-w-xs mt-2 leading-relaxed">
                {searchQuery ? "Your active search query doesn't match any project titles." : "You haven't initialized any collaborative code editor spaces yet."}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="flex items-center gap-2 mt-5 py-2 px-4 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-white text-xs font-semibold shadow-glow-purple active:scale-95 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Initialize Project
                </button>
              )}
            </motion.div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project, idx) => {
                const isOwner = project.owner?._id === user?.id;
                // Get primary file language

                return (
                  <motion.div
                    key={project._id}
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.05, duration: 0.4 }}
                    onClick={() => navigate(`/room/${project.roomId}`)}
                    className="group border border-border bg-card hover:border-primary/30 rounded-xl p-5 shadow-premium cursor-pointer transition-all hover:-translate-y-1 hover:shadow-glow-purple flex flex-col justify-between h-48 relative"
                  >
                    <div>
                      {/* Top Row: Visibility Tag & Delete */}
                      <div className="flex items-center justify-between mb-3.5">
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                          project.visibility === 'private'
                            ? 'text-red-400 bg-red-500/10 border-red-500/20'
                            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        }`}>
                          {project.visibility || 'public'}
                        </span>
                        
                        {isOwner && (
                          <button
                            onClick={(e) => handleDeleteProject(project._id, e)}
                            className="p-1 rounded text-text-dark hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                            title="Delete Project"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Title & Description */}
                      <h3 className="font-extrabold text-sm text-white truncate group-hover:text-primary transition-all">
                        {project.name}
                      </h3>
                      <p className="text-xs text-text-muted line-clamp-2 mt-1 leading-relaxed">
                        {project.description || 'No description provided.'}
                      </p>
                    </div>

                    {/* Bottom Row: Collaborators list & Open */}
                    <div className="flex items-center justify-between border-t border-border/50 pt-3.5 mt-4">
                      {/* Collaborator Avatars */}
                      <div className="flex items-center">
                        <div className="flex -space-x-1.5 overflow-hidden">
                          {/* Owner avatar */}
                          <img
                            src={project.owner?.avatar}
                            alt={project.owner?.username}
                            className="inline-block h-5 w-5 rounded-full border border-card ring-1 ring-white/10"
                            title={`Owner: ${project.owner?.username}`}
                          />
                          {/* Collaborator avatars */}
                          {project.collaborators.slice(0, 3).map(collab => (
                            <img
                              key={collab._id}
                              src={collab.avatar}
                              alt={collab.username}
                              className="inline-block h-5 w-5 rounded-full border border-card ring-1 ring-white/10"
                              title={`Collaborator: ${collab.username}`}
                            />
                          ))}
                        </div>

                        {/* Invite Trigger on Card */}
                        {isOwner && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProjectId(project._id);
                              setIsInviteOpen(true);
                            }}
                            className="ml-2 h-5 w-5 rounded-full border border-dashed border-border hover:border-primary/50 text-text-muted hover:text-white flex items-center justify-center transition-all bg-[#0a0a0d]"
                            title="Add Teammates"
                          >
                            <UserPlus className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      <span className="text-[10px] text-primary group-hover:translate-x-1 transition-all flex items-center gap-1 font-bold">
                        CODE
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* 3. Create Project Modal Dialog */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            {/* Card */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md p-6 rounded-2xl glass-panel-heavy border border-white/5 shadow-premium z-10"
            >
              <button 
                onClick={() => setIsCreateOpen(false)}
                className="absolute top-4 right-4 p-1 rounded-lg text-text-muted hover:text-white hover:bg-border transition-all"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <Code className="h-5 w-5 text-primary" />
                New Sandbox Space
              </h2>
              <p className="text-xs text-text-muted mb-5">Create a separate sandbox room and invite developers to edit code.</p>

              {modalError && (
                <div className="p-3 rounded-lg bg-red-950/20 border border-red-900/40 text-xs text-red-400 mb-4">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleCreateProject} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Project Title</label>
                  <input
                    type="text"
                    required
                    placeholder="my-collab-workspace"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full bg-[#0a0a0d] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-lg py-2.5 px-3 text-xs text-white placeholder-text-dark outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Description (Optional)</label>
                  <textarea
                    placeholder="Brief description of project files..."
                    value={newProjectDesc}
                    onChange={(e) => setNewProjectDesc(e.target.value)}
                    rows={2}
                    className="w-full bg-[#0a0a0d] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-lg py-2 px-3 text-xs text-white placeholder-text-dark outline-none transition-all resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Visibility</label>
                  <select
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}
                    className="w-full bg-[#0a0a0d] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-lg py-2.5 px-3 text-xs text-white outline-none transition-all cursor-pointer"
                  >
                    <option value="public">Public (Everyone can join)</option>
                    <option value="private">Private (Only members and invites)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 mt-6 py-2.5 px-4 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-white font-semibold text-xs transition-all shadow-glow-purple active:scale-95"
                >
                  Create Workspace
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Invite Collaborator Modal Dialog */}
      <AnimatePresence>
        {isInviteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsInviteOpen(false);
                setModalError(null);
                setInviteSuccess(null);
                setSelectedProjectId(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            {/* Card */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm p-6 rounded-2xl glass-panel-heavy border border-white/5 shadow-premium z-10"
            >
              <button 
                onClick={() => {
                  setIsInviteOpen(false);
                  setModalError(null);
                  setInviteSuccess(null);
                  setSelectedProjectId(null);
                }}
                className="absolute top-4 right-4 p-1 rounded-lg text-text-muted hover:text-white hover:bg-border transition-all"
              >
                <X className="h-4 w-4" />
              </button>

              <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <Users className="h-5 w-5 text-secondary" />
                Invite Teammates
              </h2>
              <p className="text-xs text-text-muted mb-5">Link active developers to this shared code editor room.</p>

              {modalError && (
                <div className="p-3 rounded-lg bg-red-950/20 border border-red-900/40 text-xs text-red-400 mb-4">
                  {modalError}
                </div>
              )}

              {inviteSuccess && (
                <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-900/40 text-xs text-emerald-400 mb-4 flex items-center gap-2">
                  <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
                  <span>{inviteSuccess}</span>
                </div>
              )}

              <form onSubmit={handleInviteCollaborator} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Collaborator Detail</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter email or username"
                    value={inviteeText}
                    onChange={(e) => setInviteeText(e.target.value)}
                    className="w-full bg-[#0a0a0d] border border-border focus:border-secondary/50 focus:ring-1 focus:ring-secondary/20 rounded-lg py-2.5 px-3 text-xs text-white placeholder-text-dark outline-none transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!!inviteSuccess}
                  className="w-full flex items-center justify-center gap-2 mt-6 py-2.5 px-4 rounded-xl bg-gradient-to-r from-secondary to-secondary/80 hover:from-secondary/90 hover:to-secondary text-white font-semibold text-xs transition-all shadow-glow-cyan active:scale-95 disabled:opacity-50"
                >
                  Send Project Invite
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
