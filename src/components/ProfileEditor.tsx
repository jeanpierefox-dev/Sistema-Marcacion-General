import React, { useState } from 'react';
import { Player, PlayerProfileDetails, User, PlayerRole } from '../types';
import { ImageSelectorModal } from './ImageSelectorModal';
import { PLAYER_AVATAR_PRESETS } from '../constants/sportsAssets';

interface ProfileEditorProps {
  player: Player;
  currentUser: User;
  onSave: (updatedPlayer: Player) => void;
  onClose: () => void;
}

const DEFAULT_AVATAR = PLAYER_AVATAR_PRESETS[0].url;

export const ProfileEditor: React.FC<ProfileEditorProps> = ({ player, currentUser, onSave, onClose }) => {
  // Allow ADMIN to edit, or the player themselves
  const canEdit = currentUser.role === 'ADMIN' || currentUser.linkedPlayerId === player.id;
  
  const [formData, setFormData] = useState<PlayerProfileDetails>(player.profile || {
    bio: '',
    height: 180,
    weight: 75,
    achievements: [],
    photoUrl: ''
  });
  const [name, setName] = useState(player.name || '');
  const [role, setRole] = useState<PlayerRole>(player.role || PlayerRole.OutsideHitter);
  const [isCaptain, setIsCaptain] = useState(player.isCaptain || false);
  const [jerseyNumber, setJerseyNumber] = useState(player.number || 1);
  const [showImageModal, setShowImageModal] = useState(false);

  const handleChange = (field: keyof PlayerProfileDetails, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleImageUploadDirect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const rawData = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 256;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) {
              height = Math.round((height * MAX_SIZE) / width);
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width = Math.round((width * MAX_SIZE) / height);
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.75);
            handleChange('photoUrl', compressed);
          } else {
            handleChange('photoUrl', rawData);
          }
        };
        img.onerror = () => handleChange('photoUrl', rawData);
        img.src = rawData;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...player,
      name: name.trim() || `Jugador ${jerseyNumber}`,
      number: jerseyNumber || 1,
      role: role,
      isCaptain: isCaptain,
      profile: formData
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-3 sm:p-6 overflow-y-auto backdrop-blur-md animate-in fade-in duration-200">
        <form 
          onSubmit={handleSubmit}
          className="bg-vnl-panel border border-white/20 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden"
        >
          {/* Top Bar */}
          <div className="p-4 sm:p-5 border-b border-white/10 flex justify-between items-center bg-black/40 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-vnl-accent/20 border border-vnl-accent/40 flex items-center justify-center text-vnl-accent text-lg">
                👤
              </div>
              <div>
                <h2 className="text-base sm:text-xl font-black text-white uppercase italic tracking-tighter">
                  {canEdit ? 'Editar Perfil del Jugador' : 'Ficha del Jugador'}
                </h2>
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                  #{player.number} · {player.name}
                </span>
              </div>
            </div>
            <button 
              type="button" 
              onClick={onClose} 
              className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white flex items-center justify-center text-lg font-bold transition active:scale-95"
              aria-label="Cerrar modal"
            >
              ✕
            </button>
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-grow overflow-y-auto p-4 sm:p-6 space-y-6">
            <div className="flex flex-col md:flex-row gap-6">
              
              {/* Left Column: Photo & Career Stats */}
              <div className="w-full md:w-1/3 flex flex-col items-center">
                <div 
                  onClick={() => canEdit && setShowImageModal(true)}
                  className={`w-32 h-32 sm:w-36 sm:h-36 rounded-2xl bg-black overflow-hidden shadow-2xl mb-4 border-2 border-white/20 relative group ${canEdit ? 'cursor-pointer hover:border-vnl-accent' : ''}`}
                >
                  <img 
                    src={formData.photoUrl || DEFAULT_AVATAR} 
                    alt={name} 
                    className="w-full h-full object-cover"
                  />
                  {canEdit && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition backdrop-blur-xs">
                      <span className="text-xl mb-1">📷</span>
                      <span className="text-vnl-accent text-[11px] font-black uppercase tracking-wider">Cambiar Foto</span>
                    </div>
                  )}
                </div>
                
                {canEdit ? (
                  <div className="w-full space-y-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setShowImageModal(true)}
                      className="w-full py-2.5 px-3 rounded-xl bg-vnl-accent/20 hover:bg-vnl-accent/30 border border-vnl-accent/40 text-vnl-accent font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 min-h-[44px]"
                    >
                      <span>📸</span>
                      <span>Subir / Elegir Avatar</span>
                    </button>
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="image/*"
                        id="playerFileDirect"
                        className="hidden"
                        onChange={handleImageUploadDirect}
                      />
                      <label 
                        htmlFor="playerFileDirect"
                        className="block w-full py-2 px-3 text-center rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider transition cursor-pointer border border-white/10"
                      >
                        Subir desde archivo local
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="text-center mb-4">
                    <h3 className="text-xl font-black text-white flex items-center justify-center gap-2 uppercase italic tracking-tighter">
                      {player.name}
                      {player.isCaptain && <span className="bg-yellow-400 text-black text-[10px] px-1.5 py-0.5 rounded font-black tracking-widest shadow-[0_0_10px_yellow]" title="Capitán">C</span>}
                    </h3>
                    <div className="inline-block bg-vnl-accent text-black px-3 py-1 rounded text-xs font-black mt-2 uppercase tracking-wider">
                      #{player.number} {player.role}
                    </div>
                  </div>
                )}

                {/* Career Stats Grid */}
                <div className="bg-black/40 border border-white/10 rounded-xl w-full p-4">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3 border-b border-white/5 pb-1 tracking-widest text-center">
                    Estadísticas del Jugador
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-2 bg-white/5 rounded-lg">
                      <div className="text-xl font-mono text-white font-black">{player.stats?.points || 0}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Puntos</div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg">
                      <div className="text-xl font-mono text-cyan-400 font-black">{player.stats?.matchesPlayed || 0}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Partidos</div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg">
                      <div className="text-xl font-mono text-emerald-400 font-black">{player.stats?.blocks || 0}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Bloqueos</div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg">
                      <div className="text-xl font-mono text-yellow-400 font-black">{player.stats?.mvps || 0}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">MVP</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Editable Details */}
              <div className="w-full md:w-2/3 space-y-4">
                {canEdit && (
                  <div className="space-y-4 bg-black/30 p-4 rounded-xl border border-white/10">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre Completo</label>
                      <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full p-3 bg-black/50 border border-white/15 rounded-xl text-white font-bold text-sm focus:border-vnl-accent outline-none"
                        placeholder="Ej: Carlos Silva"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">N° Camiseta</label>
                        <input 
                          type="number" 
                          min="1"
                          max="99"
                          value={jerseyNumber}
                          onChange={(e) => setJerseyNumber(parseInt(e.target.value) || 1)}
                          className="w-full p-3 bg-black/50 border border-white/15 rounded-xl text-white font-bold text-sm focus:border-vnl-accent outline-none text-center"
                          required
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Posición de Juego</label>
                        <select 
                          value={role} 
                          onChange={(e) => setRole(e.target.value as PlayerRole)}
                          className="w-full p-3 bg-black/50 border border-white/15 rounded-xl text-white font-bold text-sm focus:border-vnl-accent outline-none"
                        >
                          {Object.values(PlayerRole).map((r) => (
                            <option key={r} value={r} className="bg-slate-900 text-white">{r}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition">
                      <input 
                        type="checkbox" 
                        id="isCaptainCheck"
                        checked={isCaptain} 
                        onChange={(e) => setIsCaptain(e.target.checked)}
                        className="w-5 h-5 accent-vnl-accent rounded cursor-pointer"
                      />
                      <label htmlFor="isCaptainCheck" className="font-bold text-xs text-white uppercase tracking-wider cursor-pointer">
                        ⭐ Designar como Capitán del Equipo
                      </label>
                    </div>
                  </div>
                )}

                {/* Physical and Reach details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-black/30 p-3 rounded-xl border border-white/10">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Altura</label>
                    {canEdit ? (
                      <div className="flex items-center">
                        <input 
                          type="number" 
                          value={formData.height || ''} 
                          onChange={(e) => handleChange('height', parseInt(e.target.value) || 0)} 
                          className="w-full p-2 bg-black/50 border border-white/15 rounded-lg text-white font-bold text-sm focus:border-vnl-accent outline-none text-center" 
                          placeholder="185"
                        />
                        <span className="text-xs text-slate-400 ml-1">cm</span>
                      </div>
                    ) : (
                      <div className="font-mono font-bold text-white text-sm">{formData.height || '-'} cm</div>
                    )}
                  </div>
                  <div className="bg-black/30 p-3 rounded-xl border border-white/10">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Peso</label>
                    {canEdit ? (
                      <div className="flex items-center">
                        <input 
                          type="number" 
                          value={formData.weight || ''} 
                          onChange={(e) => handleChange('weight', parseInt(e.target.value) || 0)} 
                          className="w-full p-2 bg-black/50 border border-white/15 rounded-lg text-white font-bold text-sm focus:border-vnl-accent outline-none text-center" 
                          placeholder="78"
                        />
                        <span className="text-xs text-slate-400 ml-1">kg</span>
                      </div>
                    ) : (
                      <div className="font-mono font-bold text-white text-sm">{formData.weight || '-'} kg</div>
                    )}
                  </div>
                  <div className="bg-black/30 p-3 rounded-xl border border-white/10">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Alcance Ataque</label>
                    {canEdit ? (
                      <div className="flex items-center">
                        <input 
                          type="number" 
                          value={formData.spikeReach || ''} 
                          onChange={(e) => handleChange('spikeReach', parseInt(e.target.value) || 0)} 
                          className="w-full p-2 bg-black/50 border border-white/15 rounded-lg text-white font-bold text-sm focus:border-vnl-accent outline-none text-center" 
                          placeholder="310"
                        />
                        <span className="text-xs text-slate-400 ml-1">cm</span>
                      </div>
                    ) : (
                      <div className="font-mono font-bold text-white text-sm">{formData.spikeReach || '-'} cm</div>
                    )}
                  </div>
                  <div className="bg-black/30 p-3 rounded-xl border border-white/10">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Alcance Bloqueo</label>
                    {canEdit ? (
                      <div className="flex items-center">
                        <input 
                          type="number" 
                          value={formData.blockReach || ''} 
                          onChange={(e) => handleChange('blockReach', parseInt(e.target.value) || 0)} 
                          className="w-full p-2 bg-black/50 border border-white/15 rounded-lg text-white font-bold text-sm focus:border-vnl-accent outline-none text-center" 
                          placeholder="295"
                        />
                        <span className="text-xs text-slate-400 ml-1">cm</span>
                      </div>
                    ) : (
                      <div className="font-mono font-bold text-white text-sm">{formData.blockReach || '-'} cm</div>
                    )}
                  </div>
                </div>

                {/* Biography */}
                <div className="bg-black/30 p-4 rounded-xl border border-white/10">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Biografía y Trayectoria</label>
                  {canEdit ? (
                    <textarea 
                      rows={3}
                      value={formData.bio || ''} 
                      onChange={(e) => handleChange('bio', e.target.value)} 
                      className="w-full p-3 bg-black/50 border border-white/15 rounded-xl text-white text-xs focus:border-vnl-accent outline-none resize-none"
                      placeholder="Trayectoria deportiva, clubes anteriores, logros destacados..."
                    />
                  ) : (
                    <p className="text-xs text-slate-300 italic">{formData.bio || 'Sin biografía registrada.'}</p>
                  )}
                </div>

                {/* Achievements */}
                <div className="bg-black/30 p-4 rounded-xl border border-white/10">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Premios & Logros</label>
                  {canEdit ? (
                    <div>
                      <input 
                        type="text" 
                        value={(formData.achievements || []).join(', ')} 
                        onChange={(e) => handleChange('achievements', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} 
                        className="w-full p-3 bg-black/50 border border-white/15 rounded-xl text-white text-xs focus:border-vnl-accent outline-none"
                        placeholder="Ej: Campeón 2025, Mejor Armador 2024 (separar por comas)"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(formData.achievements || []).length > 0 ? (
                        formData.achievements.map((ach, i) => (
                          <span key={i} className="bg-yellow-500/20 text-yellow-300 text-[10px] px-2.5 py-1 rounded-lg border border-yellow-500/30 font-bold uppercase tracking-wider">
                            🏆 {ach}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">Sin logros registrados</span>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* Sticky Modal Footer with Visible, High-Touch Action Buttons */}
          <div className="p-4 sm:p-5 border-t border-white/10 bg-black/60 flex items-center justify-between gap-3 shrink-0">
            <button 
              type="button"
              onClick={onClose} 
              className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white font-bold uppercase text-xs tracking-wider transition min-h-[44px]"
            >
              Cerrar
            </button>
            {canEdit && (
              <button 
                type="submit" 
                className="px-8 py-3 rounded-xl bg-vnl-accent hover:bg-cyan-400 text-black font-black uppercase text-xs tracking-wider transition shadow-[0_0_20px_rgba(6,182,212,0.4)] min-h-[44px] active:scale-95"
              >
                Guardar Perfil
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Embedded Image Selector for Player Photo */}
      <ImageSelectorModal
        isOpen={showImageModal}
        title="Foto / Avatar del Jugador"
        currentImage={formData.photoUrl}
        targetType="player"
        onSelectImage={(url) => handleChange('photoUrl', url)}
        onClose={() => setShowImageModal(false)}
      />
    </>
  );
};
