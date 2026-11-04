
import React, { useState } from 'react';
import { Player, PlayerProfileDetails, User, PlayerRole } from '../types';

interface ProfileEditorProps {
  player: Player;
  currentUser: User;
  onSave: (updatedPlayer: Player) => void;
  onClose: () => void;
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({ player, currentUser, onSave, onClose }) => {
  // Allow ADMIN to edit, or the player themselves
  const canEdit = currentUser.role === 'ADMIN' || currentUser.linkedPlayerId === player.id;
  
  const [formData, setFormData] = useState<PlayerProfileDetails>(player.profile);
  const [name, setName] = useState(player.name);
  const [role, setRole] = useState<PlayerRole>(player.role);
  const [isCaptain, setIsCaptain] = useState(player.isCaptain || false);
  const [jerseyNumber, setJerseyNumber] = useState(player.number);

  const handleChange = (field: keyof PlayerProfileDetails, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleChange('photoUrl', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...player,
      name: name,
      number: jerseyNumber,
      role: role,
      isCaptain: isCaptain,
      profile: formData
    });
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-md">
      <div className="bg-vnl-panel border border-white/20 shadow-[0_0_50px_rgba(0,0,0,0.6)] w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
          <div className="flex items-center gap-2">
              <span className="text-2xl">👤</span>
              <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Perfil de Jugador</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl font-bold p-2 transition">✕</button>
        </div>

        <div className="flex-grow overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-vnl-accent scrollbar-track-black">
          <div className="flex flex-col md:flex-row gap-8">
            
            {/* Left Column: Photo & Basic Stats */}
            <div className="w-full md:w-1/3 flex flex-col items-center">
              <div className="w-32 h-32 md:w-40 md:h-40 bg-black rounded-full overflow-hidden shadow-2xl mb-6 border-4 border-white/10 relative group">
                <img 
                  src={formData.photoUrl || 'https://via.placeholder.com/150?text=Player'} 
                  alt={name} 
                  className="w-full h-full object-cover"
                />
                {canEdit && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer backdrop-blur-sm">
                    <span className="text-vnl-accent text-xs font-black uppercase tracking-wider">Cambiar</span>
                  </div>
                )}
              </div>
              
              {!canEdit && (
                 <div className="text-center">
                    <h3 className="text-2xl font-black text-white flex items-center justify-center gap-2 uppercase italic tracking-tighter">
                      {player.name}
                      {player.isCaptain && <span className="bg-yellow-400 text-black text-[10px] px-1.5 py-0.5 rounded font-black tracking-widest shadow-[0_0_10px_yellow]" title="Capitán">C</span>}
                    </h3>
                    <div className="inline-block bg-vnl-accent text-black px-4 py-1 rounded-none skew-x-[-10deg] text-sm font-black mt-3 uppercase tracking-wider">
                      <span className="block skew-x-[10deg]">#{player.number} {player.role}</span>
                    </div>
                 </div>
              )}

              {canEdit && (
                <div className="w-full space-y-3 mb-4">
                    <div className="relative group">
                        <label className="block text-[10px] font-bold text-vnl-accent uppercase mb-1 text-center group-hover:text-white transition cursor-pointer">📸 Subir Foto Nueva</label>
                        <input 
                            type="file" 
                            accept="image/*"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleImageUpload}
                        />
                    </div>
                    <div className="text-center">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">O ingresar URL:</span>
                        <input 
                            type="url" 
                            value={formData.photoUrl || ''} 
                            onChange={e => handleChange('photoUrl', e.target.value)} 
                            placeholder="https://..." 
                            className="w-full mt-1 p-2 bg-black/40 border border-white/10 rounded text-xs text-white text-center focus:border-vnl-accent outline-none"
                        />
                    </div>
                </div>
              )}

              {/* Stat Card */}
              <div className="bg-black/40 border border-white/10 w-full p-4 mt-2">
                 <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-4 border-b border-white/5 pb-2 tracking-widest text-center">Career Stats</h4>
                 <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                        <div className="text-2xl font-mono text-white font-black">{player.stats.points}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">PTS</div>
                    </div>
                    <div>
                        <div className="text-2xl font-mono text-blue-400 font-black">{player.stats.matchesPlayed}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">MTS</div>
                    </div>
                    <div>
                        <div className="text-2xl font-mono text-green-400 font-black">{player.stats.blocks}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">BLK</div>
                    </div>
                    <div>
                        <div className="text-2xl font-mono text-yellow-400 font-black">{player.stats.mvps}</div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">MVP</div>
                    </div>
                 </div>
              </div>
            </div>

            {/* Right Column: Editable Details */}
            <div className="w-full md:w-2/3">
              <form id="profileForm" onSubmit={handleSubmit} className="space-y-6">
                {canEdit ? (
                    <div className="space-y-4 bg-black/20 p-4 border border-white/5">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre Completo</label>
                            <input 
                                type="text" 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full p-2 bg-black/50 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none"
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                           <div className="col-span-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Camiseta</label>
                              <input 
                                type="number" 
                                value={jerseyNumber}
                                onChange={(e) => setJerseyNumber(parseInt(e.target.value))}
                                className="w-full p-2 bg-black/50 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none text-center"
                              />
                           </div>
                           <div className="col-span-2">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Posición</label>
                              <select 
                                value={role} 
                                onChange={(e) => setRole(e.target.value as PlayerRole)}
                                className="w-full p-2 bg-black/50 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none"
                              >
                                {Object.values(PlayerRole).map((r) => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                           </div>
                        </div>
                        <div className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white/5">
                             <input 
                               type="checkbox" 
                               checked={isCaptain} 
                               onChange={(e) => setIsCaptain(e.target.checked)}
                               className="w-4 h-4 accent-vnl-accent"
                             />
                             <span className="font-bold text-xs text-white uppercase tracking-wider">Es Capitán</span>
                        </div>
                    </div>
                ) : null}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Altura (cm)</label>
                    {canEdit ? (
                        <input type="number" value={formData.height} onChange={(e) => handleChange('height', parseInt(e.target.value))} className="w-full p-2 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                    ) : <div className="p-2 bg-black/20 border border-white/5 font-mono font-bold text-white text-sm">{formData.height} cm</div>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Peso (kg)</label>
                    {canEdit ? (
                        <input type="number" value={formData.weight} onChange={(e) => handleChange('weight', parseInt(e.target.value))} className="w-full p-2 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                    ) : <div className="p-2 bg-black/20 border border-white/5 font-mono font-bold text-white text-sm">{formData.weight} kg</div>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Alcance Ataque</label>
                    {canEdit ? (
                        <input type="number" value={formData.spikeReach} onChange={(e) => handleChange('spikeReach', parseInt(e.target.value))} className="w-full p-2 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                    ) : <div className="p-2 bg-black/20 border border-white/5 font-mono font-bold text-white text-sm">{formData.spikeReach || '-'} cm</div>}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Alcance Bloqueo</label>
                    {canEdit ? (
                        <input type="number" value={formData.blockReach} onChange={(e) => handleChange('blockReach', parseInt(e.target.value))} className="w-full p-2 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                    ) : <div className="p-2 bg-black/20 border border-white/5 font-mono font-bold text-white text-sm">{formData.blockReach || '-'} cm</div>}
                  </div>
                </div>

                <div>
                   <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Biografía</label>
                   {canEdit ? (
                       <textarea 
                         rows={3}
                         value={formData.bio} 
                         onChange={(e) => handleChange('bio', e.target.value)} 
                         className="w-full p-2 bg-black/40 border border-white/10 text-white text-sm focus:border-vnl-accent outline-none"
                         placeholder="Cuenta tu historia..."
                       />
                   ) : <p className="text-sm text-slate-300 bg-black/20 p-3 italic border-l-2 border-vnl-accent">{formData.bio || 'Sin biografía.'}</p>}
                </div>

                <div>
                   <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Logros & Premios</label>
                   {canEdit ? (
                       <input 
                         type="text" 
                         value={(formData.achievements || []).join(', ')} 
                         onChange={(e) => handleChange('achievements', e.target.value.split(', '))} 
                         className="w-full p-2 bg-black/40 border border-white/10 text-white text-sm focus:border-vnl-accent outline-none"
                         placeholder="Separados por coma"
                       />
                   ) : (
                       <div className="flex flex-wrap gap-2">
                           {(formData.achievements || []).length > 0 ? (formData.achievements || []).map((ach, i) => (
                               <span key={i} className="bg-yellow-900/40 text-yellow-200 text-[10px] px-2 py-1 border border-yellow-500/30 font-bold uppercase tracking-wider">🏆 {ach}</span>
                           )) : <span className="text-xs text-slate-600 font-bold uppercase">Sin logros registrados</span>}
                       </div>
                   )}
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 bg-black/40 flex justify-end gap-3">
            <button onClick={onClose} className="px-6 py-3 text-slate-400 hover:text-white font-bold uppercase text-xs tracking-wider transition">Cerrar</button>
            {canEdit && (
                <button form="profileForm" type="submit" className="px-8 py-3 bg-vnl-accent text-black font-black uppercase text-xs tracking-wider hover:bg-cyan-400 transition shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                    Guardar
                </button>
            )}
        </div>
      </div>
    </div>
  );
};
