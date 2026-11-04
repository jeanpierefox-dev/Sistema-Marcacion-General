
import React, { useState } from 'react';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
  users: User[];
  isCloudConnected: boolean; 
  onOpenCloudConfig: () => void;
  onEnterTransmitter?: () => void;
}

const AppLogoLarge = () => (
    <svg viewBox="0 0 100 100" className="w-20 h-20 mx-auto mb-6" xmlns="http://www.w3.org/2000/svg">
       <defs>
          <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
       </defs>
       {/* Shield */}
       <path d="M50 5 L90 25 L90 75 L50 95 L10 75 L10 25 Z" fill="url(#logoGrad)" />
       {/* Stylized J */}
       <path d="M60 30 L60 65 A15 15 0 0 1 30 65" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
       <circle cx="65" cy="25" r="5" fill="white" />
    </svg>
);

export const Login: React.FC<LoginProps> = ({ onLogin, users, isCloudConnected, onOpenCloudConfig, onEnterTransmitter }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const foundUser = users.find(u => u.username === username && u.password === password);
    if (foundUser) {
        onLogin(foundUser);
    } else {
        setError('Credenciales incorrectas.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-corp-bg relative overflow-hidden p-6">
      
      {/* Corporate Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-blue-900/10 rounded-full blur-[100px]"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-blue-600/5 rounded-full blur-[100px]"></div>
      </div>

      <button 
        onClick={onOpenCloudConfig}
        className="absolute top-6 right-6 text-slate-500 hover:text-corp-accent transition z-20"
        title="Configuración de Nube"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <div className="w-full max-w-md relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        <div className="text-center mb-8">
          <AppLogoLarge />
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">Bienvenido a JSport <span className="text-corp-accent">Braccini</span></h1>
          <p className="text-slate-400 text-sm">Sistema de Gestión Deportiva</p>
        </div>

        <div className="bg-corp-panel/50 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl p-8">
            <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Usuario</label>
                <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:border-corp-accent focus:bg-black/40 focus:ring-1 focus:ring-corp-accent outline-none transition-all placeholder-slate-600"
                    placeholder="Ingrese su ID"
                />
            </div>
            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Contraseña</label>
                <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:border-corp-accent focus:bg-black/40 focus:ring-1 focus:ring-corp-accent outline-none transition-all placeholder-slate-600"
                    placeholder="••••••••"
                />
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs font-medium text-center">
                {error}
                </div>
            )}

            <button
                type="submit"
                className="w-full bg-corp-accent hover:bg-corp-accent-hover text-white font-bold py-3.5 rounded-lg shadow-lg shadow-blue-500/20 transition-all transform active:scale-[0.98] mt-2 text-sm uppercase tracking-wide"
                disabled={!username || !password}
            >
                Iniciar Sesión
            </button>
            {onEnterTransmitter && (
              <button
                type="button"
                onClick={onEnterTransmitter}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3.5 rounded-lg border border-white/5 shadow-md transition-all transform active:scale-[0.98] mt-3 text-sm uppercase tracking-wide flex items-center justify-center gap-2"
              >
                <span>📱</span> Conectar Celular (Cámara VAR)
              </button>
            )}
            </form>
            
             <div className="mt-8 pt-4 border-t border-white/5 flex justify-between items-center text-xs text-slate-500">
                 <div className="flex items-center gap-2">
                     <div className={`w-1.5 h-1.5 rounded-full ${isCloudConnected ? 'bg-green-500' : 'bg-slate-600'}`}></div>
                     <span>{isCloudConnected ? 'Cloud Sync On' : 'Modo Local'}</span>
                 </div>
                 <span>v2.5 Enterprise</span>
            </div>
        </div>
      </div>
    </div>
  );
};
