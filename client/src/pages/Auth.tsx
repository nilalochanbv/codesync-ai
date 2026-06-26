import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';
import { Shield, Zap, Mail, Lock, User, Loader2, ArrowRight, X } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

interface AuthProps {
  onSuccess?: () => void;
  initialMode?: 'login' | 'register';
  isModal?: boolean;
}

const MOCK_GOOGLE_PROFILES = [
  { name: 'Linus Torvalds', email: 'linus.torvalds@gmail.com', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=linus' },
  { name: 'Guido van Rossum', email: 'guido.van.rossum@gmail.com', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=guido' },
  { name: 'James Gosling', email: 'james.gosling@gmail.com', avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=james' }
];

export default function Auth({ onSuccess, initialMode = 'login', isModal = false }: AuthProps) {
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const { login, register, loginGoogle, loginGoogleReal, isLoading, error, clearError } = useAuthStore();

  const [customGoogleName, setCustomGoogleName] = useState('');
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');

  const handleGoogleCredentialResponse = async (response: any) => {
    try {
      await loginGoogleReal(response.credential);
      if (onSuccess) onSuccess();
    } catch (err) {
      // Handled in store
    }
  };

  useEffect(() => {
    setIsLogin(initialMode === 'login');
  }, [initialMode]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    let isMounted = true;
    let checkGoogle: any = null;

    const initializeGoogleBtn = () => {
      const g = (window as any).google;
      if (g?.accounts?.id) {
        clearInterval(checkGoogle);
        
        g.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCredentialResponse,
        });

        setTimeout(() => {
          if (!isMounted) return;
          const container = document.getElementById('google-signin-btn-container');
          if (container) {
            g.accounts.id.renderButton(container, {
              theme: 'filled_dark',
              size: 'large',
              width: 350,
              shape: 'rectangular',
            });
          }
        }, 50);
      }
    };

    checkGoogle = setInterval(initializeGoogleBtn, 100);

    return () => {
      isMounted = false;
      clearInterval(checkGoogle);
    };
  }, [isLogin]);

  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
    reset: resetLoginForm,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const {
    register: registerSignup,
    handleSubmit: handleSignupSubmit,
    formState: { errors: signupErrors },
    reset: resetSignupForm,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const toggleAuthMode = () => {
    clearError();
    setIsLogin(!isLogin);
    resetLoginForm();
    resetSignupForm();
  };

  const onLoginSubmit = async (data: LoginFormValues) => {
    try {
      await login(data);
      if (onSuccess) onSuccess();
    } catch (err) {
      // Handled in store
    }
  };

  const onSignupSubmit = async (data: RegisterFormValues) => {
    try {
      await register(data);
      if (onSuccess) onSuccess();
    } catch (err) {
      // Handled in store
    }
  };

  const handleGoogleProfileSelect = async (profile: { name: string; email: string; avatar: string }) => {
    try {
      await loginGoogle({
        username: profile.name,
        email: profile.email,
        avatar: profile.avatar
      });
      setIsGoogleModalOpen(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      // Handled in store
    }
  };

  const handleCustomGoogleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGoogleName.trim() || !customGoogleEmail.trim()) return;
    
    try {
      await loginGoogle({
        username: customGoogleName.trim(),
        email: customGoogleEmail.trim()
      });
      setIsGoogleModalOpen(false);
      setCustomGoogleName('');
      setCustomGoogleEmail('');
      if (onSuccess) onSuccess();
    } catch (err) {
      // Handled in store
    }
  };

  const renderGoogleSignInButton = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (clientId) {
      return (
        <div className="space-y-4">
          <div className="relative my-6 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50"></div></div>
            <span className="relative bg-[#0c0c0f] px-3 text-[10px] uppercase font-bold text-text-dark tracking-wider">Or continue with</span>
          </div>
          <div className="w-full flex justify-center">
            <div id="google-signin-btn-container" className="w-full min-h-[44px] flex justify-center"></div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50"></div></div>
          <span className="relative bg-[#0c0c0f] px-3 text-[10px] uppercase font-bold text-text-dark tracking-wider">Or continue with</span>
        </div>
        <button
          type="button"
          onClick={() => setIsGoogleModalOpen(true)}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-card border border-border hover:bg-border text-white text-xs font-semibold tracking-wide transition-all active:scale-98 cursor-pointer"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 5.04c1.7 0 3.2.6 4.4 1.8l3.3-3.3C17.7 1.6 15 1 12 1 7.3 1 3.4 3.7 1.5 7.7l3.9 3C6.3 7.8 8.9 5.04 12 5.04z" />
            <path fill="#4285F4" d="M23.5 12.25c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.7z" />
            <path fill="#FBBC05" d="M5.4 10.7c-.2-.7-.3-1.5-.3-2.3 0-.8.1-1.6.3-2.3L1.5 3.1c-.9 1.8-1.5 4-1.5 6.1s.6 4.3 1.5 6.1l3.9-3z" />
            <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-2.9l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.7-2.7-6.6-5.6l-3.9 3C3.4 20.3 7.3 23 12 23z" />
          </svg>
          Google Account (Sandbox Mock)
        </button>
        <div className="text-[10px] text-text-muted mt-2 text-center leading-normal">
          💡 Set <code className="text-primary font-mono text-[9px]">VITE_GOOGLE_CLIENT_ID</code> in environment variables to enable official Google Login.
        </div>
      </div>
    );
  };

  const renderGoogleModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setIsGoogleModalOpen(false)}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      {/* Card */}
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="relative w-full max-w-sm p-6 rounded-2xl glass-panel-heavy border border-white/5 shadow-premium z-10 text-left"
      >
        <button 
          type="button"
          onClick={() => setIsGoogleModalOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-border transition-all cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <svg className="h-5.5 w-5.5" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M12 5.04c1.7 0 3.2.6 4.4 1.8l3.3-3.3C17.7 1.6 15 1 12 1 7.3 1 3.4 3.7 1.5 7.7l3.9 3C6.3 7.8 8.9 5.04 12 5.04z" />
            <path fill="#4285F4" d="M23.5 12.25c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.7z" />
            <path fill="#FBBC05" d="M5.4 10.7c-.2-.7-.3-1.5-.3-2.3 0-.8.1-1.6.3-2.3L1.5 3.1c-.9 1.8-1.5 4-1.5 6.1s.6 4.3 1.5 6.1l3.9-3z" />
            <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-2.9l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.7-2.7-6.6-5.6l-3.9 3C3.4 20.3 7.3 23 12 23z" />
          </svg>
          <div>
            <h3 className="font-extrabold text-sm text-white">Sign in with Google</h3>
            <p className="text-[10px] text-text-muted mt-0.5">Choose an account to continue to CodeSync AI.</p>
          </div>
        </div>

        {/* Profiles list */}
        <div className="space-y-2 mb-4">
          {MOCK_GOOGLE_PROFILES.map((profile, index) => (
            <button
              type="button"
              key={index}
              onClick={() => handleGoogleProfileSelect(profile)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-border/60 border border-border/80 transition-all text-left cursor-pointer"
            >
              <img 
                src={profile.avatar} 
                alt={profile.name} 
                className="h-7 w-7 rounded-lg border border-white/5 bg-[#121217]"
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">{profile.name}</span>
                <span className="text-[10px] text-text-muted mt-0.5">{profile.email}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Custom identity option */}
        <div className="relative my-4 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50"></div></div>
          <span className="relative bg-[#0c0c0f] px-2 text-[9px] uppercase font-bold text-text-dark tracking-wider">Or custom account</span>
        </div>

        <form onSubmit={handleCustomGoogleSubmit} className="space-y-3">
          <div className="space-y-1">
            <input
              type="text"
              required
              placeholder="Developer Name"
              value={customGoogleName}
              onChange={(e) => setCustomGoogleName(e.target.value)}
              className="w-full bg-[#0a0a0d] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl py-2 px-3 text-xs text-white placeholder-text-dark outline-none transition-all"
            />
          </div>
          <div className="space-y-1">
            <input
              type="email"
              required
              placeholder="developer.email@gmail.com"
              value={customGoogleEmail}
              onChange={(e) => setCustomGoogleEmail(e.target.value)}
              className="w-full bg-[#0a0a0d] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl py-2 px-3 text-xs text-white placeholder-text-dark outline-none transition-all"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary hover:to-secondary text-white font-semibold text-xs transition-all active:scale-95 shadow-glow-purple cursor-pointer"
          >
            Continue as Custom Developer
          </button>
        </form>
      </motion.div>
    </div>
  );

  const cardContent = (
    <motion.div
      initial={isModal ? { scale: 0.96, opacity: 0 } : { y: 20, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl shadow-premium border border-white/5 relative ${
        isModal ? 'glass-panel-heavy p-6 md:p-8 bg-[#070709]/80 backdrop-blur-xl' : 'glass-panel-heavy p-8'
      }`}
    >
      {/* Brand Header inside card for Modal */}
      {isModal && (
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border/50">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-primary to-secondary p-[1px] shadow-glow-purple flex-shrink-0">
            <div className="w-full h-full bg-[#0c0c0f] rounded-lg flex items-center justify-center">
              <Zap className="h-4.5 w-4.5 text-primary" />
            </div>
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white tracking-tight leading-none">CodeSync AI</h1>
            <p className="text-[10px] text-text-muted font-medium mt-1">Collaborate. Code. Ship Faster.</p>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {isLogin ? (
          <motion.div
            key="login-form"
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 20, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-xl font-bold mb-1 text-white">Welcome Back</h2>
            <p className="text-xs text-text-muted mb-6">Enter credentials to synchronize workspace.</p>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-red-950/20 border border-red-900/40 text-xs text-red-400 mb-4 flex gap-2 items-center"
              >
                <Shield className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            <form onSubmit={handleLoginSubmit(onLoginSubmit)} className="space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-muted tracking-wide uppercase">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-dark pointer-events-none" />
                  <input
                    type="email"
                    placeholder="developer@codesync.ai"
                    {...registerLogin('email')}
                    className="w-full bg-[#0a0a0d] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-text-dark outline-none transition-all"
                  />
                </div>
                {loginErrors.email && (
                  <span className="text-[11px] text-red-400 font-medium block pl-1">{loginErrors.email.message}</span>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-text-muted tracking-wide uppercase">Password</label>
                  <a href="#forgot" className="text-xs text-primary hover:text-primary-hover font-medium">Forgot?</a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-dark pointer-events-none" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    {...registerLogin('password')}
                    className="w-full bg-[#0a0a0d] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-text-dark outline-none transition-all"
                  />
                </div>
                {loginErrors.password && (
                  <span className="text-[11px] text-red-400 font-medium block pl-1">{loginErrors.password.message}</span>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-semibold text-sm transition-all shadow-glow-purple active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none mt-6 cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {renderGoogleSignInButton()}
          </motion.div>
        ) : (
          <motion.div
            key="register-form"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-xl font-bold mb-1 text-white">Create Account</h2>
            <p className="text-xs text-text-muted mb-6">Initialize a developer profile to get coding.</p>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg bg-red-950/20 border border-red-900/40 text-xs text-red-400 mb-4 flex gap-2 items-center"
              >
                <Shield className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            <form onSubmit={handleSignupSubmit(onSignupSubmit)} className="space-y-4">
              {/* Username */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-muted tracking-wide uppercase">Username</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-dark pointer-events-none" />
                  <input
                    type="text"
                    placeholder="linustorvalds"
                    {...registerSignup('username')}
                    className="w-full bg-[#0a0a0d] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-text-dark outline-none transition-all"
                  />
                </div>
                {signupErrors.username && (
                  <span className="text-[11px] text-red-400 font-medium block pl-1">{signupErrors.username.message}</span>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-muted tracking-wide uppercase">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-dark pointer-events-none" />
                  <input
                    type="email"
                    placeholder="developer@codesync.ai"
                    {...registerSignup('email')}
                    className="w-full bg-[#0a0a0d] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-text-dark outline-none transition-all"
                  />
                </div>
                {signupErrors.email && (
                  <span className="text-[11px] text-red-400 font-medium block pl-1">{signupErrors.email.message}</span>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-muted tracking-wide uppercase">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-dark pointer-events-none" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    {...registerSignup('password')}
                    className="w-full bg-[#0a0a0d] border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-text-dark outline-none transition-all"
                  />
                </div>
                {signupErrors.password && (
                  <span className="text-[11px] text-red-400 font-medium block pl-1">{signupErrors.password.message}</span>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-semibold text-sm transition-all shadow-glow-purple active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none mt-6 cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {renderGoogleSignInButton()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form Footer Toggle */}
      <div className="mt-6 pt-6 border-t border-border/50 text-center">
        <button
          type="button"
          onClick={toggleAuthMode}
          className="text-xs text-text-muted hover:text-white font-medium transition-all cursor-pointer"
        >
          {isLogin ? (
            <span>New to CodeSync AI? <strong className="text-primary hover:text-primary-hover font-semibold">Create account</strong></span>
          ) : (
            <span>Already have a profile? <strong className="text-primary hover:text-primary-hover font-semibold">Sign in</strong></span>
          )}
        </button>
      </div>
    </motion.div>
  );

  if (isModal) {
    return (
      <div className="w-full relative z-10 text-text">
        {cardContent}
        <AnimatePresence>
          {isGoogleModalOpen && renderGoogleModal()}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background text-text overflow-hidden px-4 select-none">
      {/* Background neon glows */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.04)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-secondary/10 blur-[130px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="h-12 w-12 rounded-xl bg-gradient-to-tr from-primary to-secondary p-[1px] shadow-glow-purple mb-4"
          >
            <div className="w-full h-full bg-[#0c0c0f] rounded-xl flex items-center justify-center">
              <Zap className="h-6 w-6 text-primary animate-pulse" />
            </div>
          </motion.div>
          <motion.h1 
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-text-muted to-white bg-clip-text text-transparent"
          >
            CodeSync AI
          </motion.h1>
          <motion.p 
            initial={{ y: -5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-sm text-text-muted mt-2 font-medium"
          >
            Collaborate. Code. Ship Faster.
          </motion.p>
        </div>
        {cardContent}
      </div>

      <AnimatePresence>
        {isGoogleModalOpen && renderGoogleModal()}
      </AnimatePresence>
    </div>
  );
}
