import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Auth from './Auth';
import { 
  Zap, Play, Code, Users, Cpu, Shield, MessageSquare, Terminal, X, Star
} from 'lucide-react';

export default function LandingPage() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const openSignIn = () => {
    setAuthMode('login');
    setIsAuthOpen(true);
  };

  const openSignUp = () => {
    setAuthMode('register');
    setIsAuthOpen(true);
  };

  return (
    <div className="relative min-h-screen bg-background text-text overflow-x-hidden font-sans select-none flex flex-col justify-between">
      {/* Background Neon Glows */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.03)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[135px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-secondary/5 blur-[135px] pointer-events-none" />

      {/* 1. Navbar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-primary to-secondary p-[1px] shadow-glow-purple">
            <div className="w-full h-full bg-[#0c0c0f] rounded-lg flex items-center justify-center">
              <Zap className="h-4.5 w-4.5 text-primary" />
            </div>
          </div>
          <span className="font-extrabold text-white text-base tracking-tight">CodeSync AI</span>
        </div>

        {/* Links */}
        <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-text-muted">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#docs" className="hover:text-white transition-colors">Docs</a>
          <a href="#blog" className="hover:text-white transition-colors">Blog</a>
          <a href="#about" className="hover:text-white transition-colors">About</a>
        </nav>

        {/* Auth triggers */}
        <div className="flex items-center gap-4">
          <button 
            onClick={openSignIn}
            className="text-xs font-semibold text-text-muted hover:text-white transition-colors cursor-pointer"
          >
            Sign in
          </button>
          <button 
            onClick={openSignUp}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-primary to-secondary hover:from-primary/95 hover:to-secondary/95 text-white transition-all shadow-glow-purple active:scale-95 cursor-pointer"
          >
            Start for Free
          </button>
        </div>
      </header>

      {/* 2. Hero Section */}
      <main className="w-full max-w-7xl mx-auto px-6 flex-1 flex flex-col lg:flex-row items-center justify-between gap-12 py-10 z-20">
        {/* Left Headline area */}
        <div className="flex-1 space-y-6 text-left max-w-lg">
          {/* AI Banner Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-[10px] font-bold text-primary/90 tracking-wide uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Now with AI Assistance
          </div>

          <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1] flex flex-col">
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent pb-1">Collaborate.</span>
            <span className="text-white">Code.</span>
            <span className="text-white">Ship Faster.</span>
          </h1>

          <p className="text-sm text-text-muted leading-relaxed max-w-md">
            Real-time collaborative code editor for modern development teams. Built for speed. Designed for developers.
          </p>

          <div className="flex items-center gap-4 pt-2">
            <button 
              onClick={openSignUp}
              className="flex items-center gap-2 py-3 px-6 rounded-xl bg-gradient-to-r from-primary to-secondary hover:from-primary/95 hover:to-secondary/95 text-white font-bold text-xs shadow-glow-purple active:scale-95 transition-all cursor-pointer"
            >
              Start Coding Now
            </button>
            <button 
              onClick={openSignIn}
              className="flex items-center gap-2 py-3 px-5 rounded-xl border border-border hover:bg-border text-white font-bold text-xs active:scale-95 transition-all cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current text-text-muted" />
              Live Demo
            </button>
          </div>

          {/* Social Proof */}
          <div className="flex items-center gap-4 pt-6 border-t border-border/50">
            <div className="flex -space-x-2">
              <img src="https://api.dicebear.com/7.x/identicon/svg?seed=linus" alt="Dev" className="h-6 w-6 rounded-full border border-background bg-card" />
              <img src="https://api.dicebear.com/7.x/identicon/svg?seed=guido" alt="Dev" className="h-6 w-6 rounded-full border border-background bg-card" />
              <img src="https://api.dicebear.com/7.x/identicon/svg?seed=james" alt="Dev" className="h-6 w-6 rounded-full border border-background bg-card" />
            </div>
            <div>
              <div className="flex items-center gap-0.5 text-yellow-500">
                <Star className="h-3 w-3 fill-current" />
                <Star className="h-3 w-3 fill-current" />
                <Star className="h-3 w-3 fill-current" />
                <Star className="h-3 w-3 fill-current" />
                <Star className="h-3 w-3 fill-current" />
              </div>
              <span className="text-[10px] text-text-dark font-extrabold tracking-wider uppercase block mt-1">Trusted by 10,000+ developers</span>
            </div>
          </div>
        </div>

        {/* Right floating Editor Graphic */}
        <div className="flex-1 w-full max-w-xl relative flex justify-center">
          {/* Neon wire-glow ring */}
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-secondary/10 rounded-2xl blur-2xl -z-10" />

          {/* Editor Sandbox Mock Card */}
          <div className="w-full bg-[#08080c] border border-border rounded-xl shadow-premium overflow-hidden flex flex-col h-[340px] relative">
            {/* Window bar */}
            <div className="bg-[#0c0c0f] border-b border-border/50 px-4 py-2 flex items-center justify-between shrink-0">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
              </div>
              <div className="text-[10px] font-mono text-text-dark uppercase tracking-wider">main.js</div>
              <div className="w-12" />
            </div>

            {/* Monaco code view */}
            <div className="flex-1 p-5 font-mono text-xs text-text-muted leading-relaxed overflow-hidden relative text-left select-text">
              {/* Overlapping cursor badges */}
              <div className="absolute top-16 left-[220px] flex flex-col items-start gap-1 z-30">
                <div className="bg-primary px-1.5 py-0.5 rounded text-[8px] font-bold text-[#070709] flex items-center gap-1">
                  <Users className="h-2.5 w-2.5" />
                  <span>Alice</span>
                </div>
                <div className="w-1 h-3 bg-primary animate-pulse" />
              </div>

              <div className="absolute top-28 left-[380px] flex flex-col items-start gap-1 z-30">
                <div className="bg-secondary px-1.5 py-0.5 rounded text-[8px] font-bold text-[#070709] flex items-center gap-1">
                  <Users className="h-2.5 w-2.5" />
                  <span>Bob</span>
                </div>
                <div className="w-1 h-3 bg-secondary animate-pulse" />
              </div>

              <div className="absolute top-44 left-[140px] flex flex-col items-start gap-1 z-30">
                <div className="bg-accent px-1.5 py-0.5 rounded text-[8px] font-bold text-[#070709] flex items-center gap-1">
                  <Users className="h-2.5 w-2.5" />
                  <span>Charlie</span>
                </div>
                <div className="w-1 h-3 bg-accent animate-pulse" />
              </div>

              {/* Code lines */}
              <div className="space-y-1">
                <div><span className="text-text-dark mr-4">1</span><span className="text-purple-400">import</span> &#123; io &#125; <span className="text-purple-400">from</span> <span className="text-green-400">"socket.io-client"</span>;</div>
                <div><span className="text-text-dark mr-4">2</span><span className="text-purple-400">const</span> <span className="text-blue-400">socket</span> = <span className="text-yellow-400">io</span>(<span className="text-green-400">"https://codesync.ai"</span>);</div>
                <div><span className="text-text-dark mr-4">3</span></div>
                <div><span className="text-text-dark mr-4">4</span><span className="text-blue-400">socket</span>.<span className="text-yellow-400">on</span>(<span className="text-green-400">"code-change"</span>, (data) =&gt; &#123;</div>
                <div><span className="text-text-dark mr-4">5</span>  <span className="text-text-dark">// Real-time code synchronization</span></div>
                <div><span className="text-text-dark mr-4">6</span>  <span className="text-yellow-400">updateEditor</span>(data);</div>
                <div><span className="text-text-dark mr-4">7</span>&#125;);</div>
                <div><span className="text-text-dark mr-4">8</span></div>
                <div><span className="text-text-dark mr-4">9</span><span className="text-purple-400">function</span> <span className="text-yellow-400">updateEditor</span>(data) &#123;</div>
                <div><span className="text-text-dark mr-4">10</span>  <span className="text-purple-400">const</span> <span className="text-blue-400">editor</span> = monaco.editor.<span className="text-yellow-400">getModels</span>()[0];</div>
                <div><span className="text-text-dark mr-4">11</span>  editor.<span className="text-yellow-400">pushEditOperations</span>([], data.operations);</div>
                <div><span className="text-text-dark mr-4">12</span>&#125;</div>
              </div>
            </div>

            {/* Bottom presence bar */}
            <div className="bg-[#0a0a0d] border-t border-border/50 px-4 py-2.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-[10px] text-text-muted">
                <div className="flex -space-x-1.5">
                  <img src="https://api.dicebear.com/7.x/identicon/svg?seed=Alice" alt="Dev" className="h-4.5 w-4.5 rounded-full border border-card bg-card" />
                  <img src="https://api.dicebear.com/7.x/identicon/svg?seed=Bob" alt="Dev" className="h-4.5 w-4.5 rounded-full border border-card bg-card" />
                  <img src="https://api.dicebear.com/7.x/identicon/svg?seed=Charlie" alt="Dev" className="h-4.5 w-4.5 rounded-full border border-card bg-card" />
                </div>
                <span>Alice is typing...</span>
              </div>
              <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-accent animate-ping" />
                3 Online
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Bottom Features strip */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-8 border-t border-border/50 shrink-0 z-20">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          <div className="flex flex-col items-start gap-2">
            <Code className="h-4 w-4 text-primary" />
            <div className="text-xs font-bold text-white leading-none">Real-time Editing</div>
            <div className="text-[10px] text-text-muted">Collaborate instantly</div>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Users className="h-4 w-4 text-secondary" />
            <div className="text-xs font-bold text-white leading-none">Live Cursors</div>
            <div className="text-[10px] text-text-muted">See everyone live</div>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Cpu className="h-4 w-4 text-accent" />
            <div className="text-xs font-bold text-white leading-none">AI Assistant</div>
            <div className="text-[10px] text-text-muted">Smart code help</div>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Terminal className="h-4 w-4 text-yellow-500" />
            <div className="text-xs font-bold text-white leading-none">Run & Debug</div>
            <div className="text-[10px] text-text-muted">Output in real-time</div>
          </div>
          <div className="flex flex-col items-start gap-2">
            <MessageSquare className="h-4 w-4 text-pink-500" />
            <div className="text-xs font-bold text-white leading-none">Chat & Voice</div>
            <div className="text-[10px] text-text-muted">Stay in sync</div>
          </div>
          <div className="flex flex-col items-start gap-2">
            <Shield className="h-4 w-4 text-blue-500" />
            <div className="text-xs font-bold text-white leading-none">Secure</div>
            <div className="text-[10px] text-text-muted">Enterprise grade</div>
          </div>
        </div>
      </footer>

      {/* 4. Login/Register Auth Modal overlay */}
      <AnimatePresence>
        {isAuthOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAuthOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            {/* Auth card container */}
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md z-10"
            >
              <button 
                onClick={() => setIsAuthOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-border transition-all z-50 cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
              
              {/* Reuse our completed validation Auth card */}
              <Auth onSuccess={() => setIsAuthOpen(false)} initialMode={authMode} isModal={true} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
