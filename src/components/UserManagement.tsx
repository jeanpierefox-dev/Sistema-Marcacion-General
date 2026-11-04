
import React, { useState } from 'react';
import { User, UserRole, Team } from '../types';

interface UserManagementProps {
  users: User[];
  teams: Team[]; // Needed to link coaches to teams
  currentUser: User;
  onAddUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  onUpdateUser: (user: User) => void;
  onSystemReset?: () => void; // New prop for admin reset
}

export const UserManagement: React.FC<UserManagementProps> = ({ users, teams, currentUser, onAddUser, onDeleteUser, onUpdateUser, onSystemReset }) => {
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    role: 'VIEWER' as UserRole,
    linkedTeamId: '',
    linkedPlayerId: ''
  });

  const [passwordModalUser, setPasswordModalUser] = useState<User | null>(null);
  const [newPass, setNewPass] = useState('');

  const isSuperAdmin = currentUser.role === 'ADMIN';

  // Filter users based on hierarchy
  // Admin sees all. Coach sees users they created OR users linked to their team.
  const visibleUsers = isSuperAdmin 
    ? users 
    : users.filter(u => u.createdBy === currentUser.id || (currentUser.linkedTeamId && u.linkedTeamId === currentUser.linkedTeamId && u.id !== currentUser.id));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password) return;

    const user: User = {
      id: `u-${Date.now()}`,
      username: newUser.username,
      password: newUser.password,
      role: newUser.role,
      createdBy: currentUser.id,
    };

    if (newUser.linkedTeamId) {
        user.linkedTeamId = newUser.linkedTeamId;
    }
    if (newUser.linkedPlayerId) {
        user.linkedPlayerId = newUser.linkedPlayerId;
    }
    
    // Auto-link to coach's team if coach is creating
    if (!isSuperAdmin && currentUser.linkedTeamId) {
        user.linkedTeamId = currentUser.linkedTeamId;
    }

    onAddUser(user);
    setNewUser({ username: '', password: '', role: 'VIEWER', linkedTeamId: '', linkedPlayerId: '' });
  };

  const handleSavePassword = () => {
    if (passwordModalUser && newPass) {
        onUpdateUser({ ...passwordModalUser, password: newPass });
        setPasswordModalUser(null);
        setNewPass('');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-end border-b border-white/10 pb-2">
         <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Gestión de <span className="text-vnl-accent">Usuarios</span></h2>
         {!isSuperAdmin && <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Mis Usuarios</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Create User Form */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-vnl-panel p-6 border border-white/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-vnl-accent/5 rounded-full blur-xl -mr-10 -mt-10 pointer-events-none"></div>
            
            <h3 className="font-bold text-sm text-vnl-accent uppercase tracking-widest mb-6">Crear Nuevo Usuario</h3>
            <form onSubmit={handleCreate} className="space-y-4 relative z-10">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Usuario</label>
                <input 
                  type="text" 
                  value={newUser.username}
                  onChange={e => setNewUser({...newUser, username: e.target.value})}
                  className="w-full p-3 bg-black/40 border border-white/10 rounded text-sm text-white font-bold focus:border-vnl-accent focus:ring-1 focus:ring-vnl-accent outline-none transition"
                  placeholder="Nombre de usuario"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Contraseña</label>
                <input 
                  type="text" 
                  value={newUser.password}
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                  className="w-full p-3 bg-black/40 border border-white/10 rounded text-sm text-white font-bold focus:border-vnl-accent focus:ring-1 focus:ring-vnl-accent outline-none transition"
                  placeholder="Contraseña"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rol</label>
                <select 
                  value={newUser.role}
                  onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}
                  className="w-full p-3 bg-black/40 border border-white/10 rounded text-sm text-white font-bold focus:border-vnl-accent focus:ring-1 focus:ring-vnl-accent outline-none transition appearance-none"
                >
                  <option value="VIEWER">Espectador / TV</option>
                  
                  {isSuperAdmin ? (
                      <>
                        <option value="ADMIN">Administrador</option>
                        <option value="MAIN_REFEREE">Árbitro General (Control)</option>
                        <option value="REFEREE">Árbitro de Piso (Rotaciones)</option>
                        <option value="COACH_A">Entrenador (Coach)</option>
                        <option value="PLAYER">Jugador</option>
                      </>
                  ) : (
                      // Coach can only create players or viewers
                      <option value="PLAYER">Jugador</option>
                  )}
                </select>
              </div>

              {/* Conditional Linking based on Role */}
              {isSuperAdmin && (newUser.role === 'COACH_A' || newUser.role === 'COACH_B') && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Vincular a Equipo</label>
                  <select 
                    value={newUser.linkedTeamId}
                    onChange={e => setNewUser({...newUser, linkedTeamId: e.target.value})}
                    className="w-full p-3 bg-black/40 border border-white/10 rounded text-sm text-white font-bold focus:border-vnl-accent focus:ring-1 focus:ring-vnl-accent outline-none transition appearance-none"
                    required
                  >
                    <option value="">Seleccionar Equipo...</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <button 
                type="submit"
                className="w-full bg-vnl-accent hover:bg-cyan-400 text-black font-black py-3 uppercase tracking-widest text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] transition transform hover:scale-[1.02]"
              >
                Crear Usuario
              </button>
            </form>
          </div>

          {/* DANGER ZONE - ADMIN ONLY */}
          {isSuperAdmin && onSystemReset && (
             <div className="bg-red-900/10 p-6 border border-red-500/30 relative overflow-hidden">
                <h3 className="font-black text-xs text-red-500 uppercase tracking-widest mb-2">Zona de Peligro</h3>
                <p className="text-[10px] text-red-400 mb-4 font-bold">Esta acción borrará todos los datos de la nube (Torneos, Equipos, Partidos) y restablecerá el sistema.</p>
                <button 
                  onClick={onSystemReset}
                  className="w-full bg-red-600/80 hover:bg-red-600 text-white font-black py-3 uppercase tracking-widest text-xs shadow-lg transition flex items-center justify-center gap-2"
                >
                  ⚠️ Factory Reset
                </button>
             </div>
          )}
        </div>

        {/* User List */}
        <div className="lg:col-span-2">
           <div className="bg-vnl-panel border border-white/10 overflow-hidden relative">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-vnl-accent"></div>
             
             <table className="w-full text-sm text-left">
               <thead className="bg-black/40 text-slate-400 uppercase font-bold text-[10px] tracking-widest border-b border-white/10">
                 <tr>
                   <th className="px-6 py-4">Usuario</th>
                   <th className="px-6 py-4">Rol</th>
                   <th className="px-6 py-4">Creado Por</th>
                   <th className="px-6 py-4 text-right">Acciones</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                 {visibleUsers.map(user => {
                   const creator = users.find(u => u.id === user.createdBy);
                   return (
                     <tr key={user.id} className="hover:bg-white/5 transition duration-150">
                       <td className="px-6 py-4 font-bold text-white">{user.username}</td>
                       <td className="px-6 py-4">
                         <span className={`px-2 py-1 text-[9px] font-black uppercase tracking-wider border 
                           ${user.role === 'ADMIN' ? 'bg-purple-900/30 text-purple-400 border-purple-500/30' : 
                             user.role === 'VIEWER' ? 'bg-slate-800 text-slate-400 border-slate-600' :
                             user.role === 'REFEREE' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-500/30' : 
                             'bg-blue-900/30 text-blue-400 border-blue-500/30'}`}>
                           {user.role}
                         </span>
                       </td>
                       <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                         {creator ? creator.username : 'SYSTEM'}
                       </td>
                       <td className="px-6 py-4 text-right">
                         <div className="flex justify-end gap-3">
                            <button 
                                onClick={() => { setPasswordModalUser(user); setNewPass(''); }}
                                className="text-vnl-accent hover:text-white font-bold text-xs uppercase"
                                title="Cambiar Contraseña"
                            >
                                Pass
                            </button>
                             {user.username !== 'admin' && (
                               <button 
                                 onClick={() => onDeleteUser(user.id)}
                                 className="text-red-500 hover:text-red-400 font-bold text-xs uppercase"
                               >
                                 Del
                               </button>
                             )}
                         </div>
                       </td>
                     </tr>
                   );
                 })}
               </tbody>
             </table>
             {visibleUsers.length === 0 && <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">No hay usuarios registrados</div>}
           </div>
        </div>
      </div>

      {/* CHANGE PASSWORD MODAL */}
      {passwordModalUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-vnl-panel border border-white/20 p-6 shadow-2xl w-80">
                <h3 className="font-black text-white text-lg mb-4 uppercase italic">Cambiar Contraseña</h3>
                <p className="text-xs text-slate-400 mb-6 font-bold">Usuario: <span className="text-vnl-accent">{passwordModalUser.username}</span></p>
                <div className="mb-6">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nueva Contraseña</label>
                    <input 
                        type="text" 
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        className="w-full p-3 bg-black/40 border border-white/10 rounded text-sm text-white font-bold focus:border-vnl-accent focus:outline-none"
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <button onClick={() => setPasswordModalUser(null)} className="px-4 py-2 text-slate-400 hover:text-white font-bold uppercase text-xs transition">Cancelar</button>
                    <button onClick={handleSavePassword} className="px-6 py-2 bg-vnl-accent text-black font-black uppercase text-xs hover:bg-cyan-400 transition">Guardar</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
