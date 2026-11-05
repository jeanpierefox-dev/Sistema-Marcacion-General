
import React, { ReactNode } from 'react';
import { User } from '../types';

interface LayoutProps {
  children: ReactNode;
  currentUser: User;
  onLogout: () => void;
  onNavigate: (view: string) => void;
  currentView: string;
  isCloudConnected: boolean;
  onOpenCloudConfig: () => void;
}

// Corporate Hexagon Logo with stylized "J"
const AppLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={`${className}`} xmlns="http://www.w3.org/2000/svg">
     <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
     </defs>
     {/* Shield/Hexagon Base */}
     <path d="M50 5 L90 25 L90 75 L50 95 L10 75 L10 25 Z" fill="url(#logoGradient)" />
     {/* Stylized J Shape Cutout */}
     <path d="M60 30 L60 65 A15 15 0 0 1 30 65" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
     {/* Sport Dot/Accent */}
     <circle cx="65" cy="25" r="5" fill="white" />
  </svg>
);

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  currentUser, 
  onLogout, 
  onNavigate, 
  currentView,
  isCloudConnected,
  onOpenCloudConfig
}) => {
  const isAdmin = currentUser.role === 'ADMIN';
  const canManage = isAdmin || currentUser.role.includes('COACH');

  // Helper for Nav Items
  const NavItem = ({ view, label, icon, isMobile = false }: { view: string, label: string, icon: React.ReactNode, isMobile?: boolean }) => {
    const isActive = currentView === view;
    
    if (isMobile) {
        return (
            <button 
                onClick={() => onNavigate(view)}
                className={`flex-1 flex flex-col items-center justify-center py-3 transition-all duration-300 relative ${isActive ? 'text-white' : 'text-slate-400'}`}
            >
                <div className={`mb-1 transition-transform ${isActive ? 'scale-110 text-corp-accent' : ''}`}>{icon}</div>
                <span className={`text-[10px] font-medium tracking-wide ${isActive ? 'font-bold' : ''}`}>{label}</span>
                {isActive && <div className="absolute top-0 w-12 h-0.5 bg-corp-accent shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>}
            </button>
        );
    }

    return (
        <button 
          onClick={() => onNavigate(view)}
          className={`relative flex items-center gap-2 px-4 py-2 rounded-md transition-all font-medium text-sm ${
            isActive 
              ? 'bg-corp-accent text-white shadow-md' 
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <span className="text-lg">{icon}</span>
          <span>{label}</span>
        </button>
    );
  };

  // Icons
  const Icons = {
      Home: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
      Trophy: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
      Chart: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 17V7"/><path d="M12 17v-6"/><path d="M16 17v-4"/></svg>,
      Users: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      Calendar: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>,
      Shield: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
      Logout: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
  };

  return (
    <div className="min-h-screen bg-corp-bg flex flex-col font-sans text-slate-100 selection:bg-corp-accent selection:text-white">
      
      {/* --- DESKTOP TOP BAR --- */}
      <header className="bg-corp-panel/80 border-b border-white/5 sticky top-0 z-50 backdrop-blur-md h-16">
        <div className="max-w-7xl mx-auto px-6 h-full flex justify-between items-center">
            
            {/* Brand */}
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onNavigate('home')}>
              <div className="bg-white/5 p-1 rounded-lg group-hover:bg-white/10 transition duration-300">
                  <AppLogo className="w-8 h-8" />
              </div>
              <div className="flex flex-col justify-center">
                <h1 className="text-lg font-bold tracking-tight text-white leading-none">JSPORT <span className="text-corp-accent">BRACCINI</span></h1>
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-widest leading-none mt-1">Management Suite</span>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center h-full gap-2 ml-10">
               <NavItem view="home" label="Inicio" icon={Icons.Home} />
               <NavItem view="lobby" label="Torneos" icon={Icons.Trophy} />
               <NavItem view="teams" label="Equipos" icon={Icons.Users} />
               {canManage && <NavItem view="users" label={isAdmin ? "Admin" : "Usuarios"} icon={Icons.Shield} />}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-4 ml-auto">

               {/* Cloud Indicator */}
               <button 
                 onClick={onOpenCloudConfig}
                 title="Conexión en la Nube y Dispositivos"
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-widest transition hover:opacity-80 ${
                     isCloudConnected 
                     ? 'border-green-500/20 bg-green-500/10 text-green-400' 
                     : 'border-red-500/20 bg-red-500/10 text-red-400'
                 }`}
               >
                  <div className={`w-1.5 h-1.5 rounded-full ${isCloudConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                  <span className="hidden sm:inline">{isCloudConnected ? 'NUBE ACTIVA' : 'OFFLINE'}</span>
               </button>

               {/* Profile Dropdown Simulation */}
               <div className="flex items-center gap-3 pl-4 border-l border-white/5">
                   <div className="text-right hidden sm:block">
                       <div className="text-xs font-semibold text-white">{currentUser.username}</div>
                       <div className="text-[10px] text-slate-500 capitalize">{currentUser.role.toLowerCase().replace('_', ' ')}</div>
                   </div>
                   <div className="w-8 h-8 bg-corp-accent rounded-full flex items-center justify-center font-bold text-xs text-white shadow-lg ring-2 ring-corp-bg cursor-pointer hover:ring-corp-accent/50 transition">
                       {currentUser.username[0].toUpperCase()}
                   </div>
                   <button 
                     onClick={onLogout} 
                     className="text-slate-500 hover:text-white transition ml-2"
                     title="Cerrar Sesión"
                   >
                      {Icons.Logout}
                   </button>
               </div>
            </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-grow p-3 sm:p-6 md:p-8 max-w-7xl mx-auto w-full relative z-10 pb-28 md:pb-8">
        {children}
      </main>

      {/* --- MOBILE BOTTOM BAR (iOS Style) --- */}
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-corp-panel/95 backdrop-blur-xl border-t border-white/10 z-40 pb-safe-area shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
          <div className="flex justify-around items-center px-2">
               <NavItem isMobile view="home" label="Inicio" icon={Icons.Home} />
               <NavItem isMobile view="lobby" label="Torneos" icon={Icons.Trophy} />
               <NavItem isMobile view="teams" label="Equipos" icon={Icons.Users} />
               {canManage && <NavItem isMobile view="users" label={isAdmin ? "Admin" : "Usuarios"} icon={Icons.Shield} />}
          </div>
      </div>

    </div>
  );
};
