import React, { useState } from 'react';
import { Player, Team } from '../types';

interface RotationViewProps {
  teamA: Team;
  teamB: Team;
  rotationA: (Player | null)[];
  rotationB: (Player | null)[];
  isVertical?: boolean;
  servingTeamId?: string;
  initialTab?: 'both' | 'teamA' | 'teamB';
  onTabChange?: (tab: 'both' | 'teamA' | 'teamB') => void;
  onClose?: () => void;
}

export const RotationView: React.FC<RotationViewProps> = ({ 
  teamA, 
  teamB, 
  rotationA, 
  rotationB, 
  isVertical = false,
  servingTeamId,
  initialTab = 'both',
  onTabChange,
  onClose 
}) => {
  // Modo de visualización: ambos separados lado a lado, solo Equipo A, o solo Equipo B
  const [activeTab, setActiveTab] = useState<'both' | 'teamA' | 'teamB'>(initialTab);

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabSelect = (tab: 'both' | 'teamA' | 'teamB') => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const getPlayer = (rot: (Player | null)[] | undefined, pos: number): Player | null => {
    if (!rot || !Array.isArray(rot)) return null;
    return rot[pos - 1] || null; // pos es 1..6
  };

  const getRoleBadge = (player: Player) => {
    const role = (player.role || '').toLowerCase();
    if (role.includes('libero') || player.name.toLowerCase().includes('libero')) {
      return { label: 'LÍBERO', bg: 'bg-amber-400 text-slate-950 border-amber-300 font-black' };
    }
    if (role.includes('armador') || role.includes('setter')) {
      return { label: 'ARMADOR', bg: 'bg-cyan-500/30 text-cyan-200 border-cyan-400/40' };
    }
    if (role.includes('central') || role.includes('middle')) {
      return { label: 'CENTRAL', bg: 'bg-emerald-500/30 text-emerald-200 border-emerald-400/40' };
    }
    if (role.includes('opuesto') || role.includes('opposite')) {
      return { label: 'OPUESTO', bg: 'bg-purple-500/30 text-purple-200 border-purple-400/40' };
    }
    return { label: 'PUNTA', bg: 'bg-blue-500/30 text-blue-200 border-blue-400/40' };
  };

  const renderPlayerSlot = (
    player: Player | null, 
    pos: number, 
    posName: string, 
    isServing: boolean,
    teamAccentColor: 'cyan' | 'rose'
  ) => {
    if (!player) {
      return (
        <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-900/40 border border-dashed border-white/10 min-h-[92px]">
          <span className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-xs font-mono font-bold text-slate-500">
            P{pos}
          </span>
          <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-500 mt-1">
            {posName}
          </span>
          <span className="text-[10px] text-slate-600 italic">Vacío</span>
        </div>
      );
    }

    const roleInfo = getRoleBadge(player);
    const isLibero = roleInfo.label === 'LÍBERO';
    const isServerNow = isServing && pos === 1;

    return (
      <div 
        className={`relative flex flex-col items-center justify-center p-2.5 rounded-xl transition-all duration-300 shadow-md ${
          isServerNow 
            ? 'bg-gradient-to-b from-yellow-500/25 to-slate-900/90 border-2 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.35)] scale-[1.03]' 
            : teamAccentColor === 'cyan'
              ? 'bg-gradient-to-b from-slate-900/90 to-[#0e1b33]/90 border border-cyan-500/30 hover:border-cyan-400/60'
              : 'bg-gradient-to-b from-slate-900/90 to-[#2b0e1b]/90 border border-rose-500/30 hover:border-rose-400/60'
        }`}
      >
        {/* Zona / Posición tag */}
        <div className="absolute top-1 left-1.5 flex items-center gap-1">
          <span className="text-[8px] font-mono font-black px-1.5 py-0.5 rounded bg-black/60 text-slate-300 border border-white/10">
            Z{pos}
          </span>
          {isServerNow && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-yellow-400 text-slate-950 shadow-[0_0_8px_#facc15] animate-pulse flex items-center gap-0.5">
              <span>🏐</span> SAQUE
            </span>
          )}
        </div>

        {/* Posición rol corta (Delantero / Zaguero) */}
        <span className="absolute top-1 right-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-400">
          {posName}
        </span>

        {/* Camiseta / Avatar con Número destacado */}
        <div className="mt-4 flex items-center justify-center relative">
          <div 
            className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center font-black text-lg md:text-xl shadow-lg border-2 relative z-10 ${
              isLibero 
                ? 'bg-amber-400 text-slate-950 border-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.6)]' 
                : teamAccentColor === 'cyan'
                  ? 'bg-cyan-600 text-white border-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                  : 'bg-rose-600 text-white border-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
            }`}
          >
            {player.profile?.photoUrl ? (
              <img 
                src={player.profile.photoUrl} 
                alt={player.name} 
                className="w-full h-full object-cover rounded-full" 
              />
            ) : (
              <span>#{player.number}</span>
            )}
            
            {player.isCaptain && (
              <span className="absolute -bottom-1 -right-1 bg-yellow-400 text-slate-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-slate-900 shadow">
                C
              </span>
            )}
          </div>
        </div>

        {/* Nombre del jugador */}
        <h4 className="mt-2 text-xs md:text-sm font-black text-white text-center truncate max-w-[140px] uppercase tracking-wide">
          {player.name}
        </h4>

        {/* Rol pill */}
        <div className="mt-1 flex items-center gap-1">
          <span className={`text-[8px] md:text-[9px] uppercase px-2 py-0.5 rounded-full border font-bold ${roleInfo.bg}`}>
            {roleInfo.label}
          </span>
        </div>
      </div>
    );
  };

  const renderTeamTacticalCard = (
    team: Team, 
    rotation: (Player | null)[], 
    teamBadge: 'EQ. A' | 'EQ. B', 
    accentColor: 'cyan' | 'rose'
  ) => {
    const isServing = servingTeamId === team.id;
    const borderGlow = accentColor === 'cyan' 
      ? 'border-cyan-500/40 shadow-[0_10px_35px_rgba(6,182,212,0.15)]' 
      : 'border-rose-500/40 shadow-[0_10px_35px_rgba(244,63,94,0.15)]';
    const badgeBg = accentColor === 'cyan' 
      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40' 
      : 'bg-rose-500/20 text-rose-300 border-rose-400/40';

    return (
      <div className={`bg-gradient-to-b from-[#0f172a] via-[#090d16] to-[#04070e] border ${borderGlow} rounded-2xl p-4 md:p-5 flex flex-col gap-4 text-white w-full transition-all`}>
        {/* Encabezado del Equipo */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 md:w-13 md:h-13 rounded-xl bg-black/60 border border-white/10 p-1 flex items-center justify-center shrink-0 shadow-md">
              {team.logoUrl ? (
                <img src={team.logoUrl} alt={team.name} className="w-full h-full object-contain" />
              ) : (
                <span className="text-lg font-black text-slate-300">{team.name[0]}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] md:text-[10px] font-black uppercase px-2 py-0.5 rounded border tracking-widest ${badgeBg}`}>
                  {teamBadge}
                </span>
                {isServing && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-yellow-400 text-slate-950 flex items-center gap-1 shadow-sm">
                    <span>🏐</span> AL SERVICIO
                  </span>
                )}
              </div>
              <h3 className="text-base md:text-xl font-black uppercase tracking-wider text-white truncate mt-0.5">
                {team.name}
              </h3>
              {team.coachName && (
                <p className="text-[10px] text-slate-400 truncate">
                  DT: <span className="text-slate-300 font-semibold">{team.coachName}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Cancha Táctica Separada */}
        <div className="relative rounded-xl overflow-hidden border-2 border-white/20 bg-gradient-to-b from-[#1b3a6e] to-[#0c1f3d] p-3 shadow-inner">
          {/* LÍNEA DE RED (Frente / Red) */}
          <div className="mb-3 flex items-center justify-center relative">
            <div className="w-full h-2 bg-gradient-to-r from-white/70 via-white to-white/70 rounded-full shadow-[0_0_12px_rgba(255,255,255,0.8)]"></div>
            <span className="absolute bg-slate-950 text-white font-black text-[9px] md:text-[10px] px-3 py-0.5 rounded-full border border-white/30 tracking-widest uppercase shadow">
              RED / BLOQUEO
            </span>
          </div>

          {/* FILA DELANTERA (Zona 4 - Ataque Izq, Zona 3 - Central, Zona 2 - Ataque Der) */}
          <div>
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[9px] font-black text-cyan-300 tracking-wider uppercase">
                Fila Delantera (Ataque y Bloqueo)
              </span>
              <span className="text-[8px] text-slate-400">Línea de 3 metros</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {renderPlayerSlot(getPlayer(rotation, 4), 4, 'Ataque Izq', isServing, accentColor)}
              {renderPlayerSlot(getPlayer(rotation, 3), 3, 'Central', isServing, accentColor)}
              {renderPlayerSlot(getPlayer(rotation, 2), 2, 'Ataque Der', isServing, accentColor)}
            </div>
          </div>

          {/* LÍNEA DE ATAQUE DE 3 METROS */}
          <div className="my-3 flex items-center gap-2">
            <div className="flex-1 h-[2px] bg-white/40 border-b border-dashed border-white/60"></div>
            <span className="text-[8px] font-mono uppercase text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-white/10">
              Zona de Ataque (3m)
            </span>
            <div className="flex-1 h-[2px] bg-white/40 border-b border-dashed border-white/60"></div>
          </div>

          {/* FILA ZAGUERA (Zona 5 - Defensa Izq, Zona 6 - Zaguero Centro, Zona 1 - Saque Der) */}
          <div>
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[9px] font-black text-amber-300 tracking-wider uppercase">
                Fila Zaguera (Defensa y Saque)
              </span>
              <span className="text-[8px] text-slate-400">Fondo de Cancha</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {renderPlayerSlot(getPlayer(rotation, 5), 5, 'Defensa Izq', isServing, accentColor)}
              {renderPlayerSlot(getPlayer(rotation, 6), 6, 'Zaguero Centro', isServing, accentColor)}
              {renderPlayerSlot(getPlayer(rotation, 1), 1, 'Zona Saque', isServing, accentColor)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`fixed inset-0 z-[130] flex flex-col items-center justify-center p-3 md:p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-200 overflow-y-auto ${
      isVertical ? 'rotate-90 origin-center' : ''
    }`}>
      <div className="w-full max-w-6xl flex flex-col gap-4 my-auto">
        
        {/* Barra superior con Título, Selector de Vista y Botón Cerrar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/80 border border-white/10 rounded-2xl p-3.5 px-5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping"></div>
            <div>
              <h2 className="text-lg md:text-2xl font-black text-white uppercase italic tracking-wider">
                Rotación Táctica de Cancha
              </h2>
              <p className="text-[10px] md:text-xs text-slate-400">
                Alineación reglamentaria de cada equipo con zonas 1 a 6
              </p>
            </div>
          </div>

          {/* Selector de modo: Ambos Equipos o individual */}
          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => handleTabSelect('both')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'both'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              👥 Ambos Equipos
            </button>
            <button
              onClick={() => handleTabSelect('teamA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'teamA'
                  ? 'bg-cyan-600 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              🔵 EQ. A: {teamA.name.split(' ')[0]}
            </button>
            <button
              onClick={() => handleTabSelect('teamB')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'teamB'
                  ? 'bg-rose-600 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              🔴 EQ. B: {teamB.name.split(' ')[0]}
            </button>
          </div>

          {/* Botón Cerrar */}
          {onClose && (
            <button
              onClick={onClose}
              className="bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white px-3.5 py-1.5 rounded-xl font-bold uppercase text-xs border border-red-500/40 transition-all flex items-center gap-1.5"
            >
              <span>✕</span> Cerrar
            </button>
          )}
        </div>

        {/* Tableros Tácticos (Separados) */}
        <div className="w-full">
          {activeTab === 'both' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {renderTeamTacticalCard(teamA, rotationA, 'EQ. A', 'cyan')}
              {renderTeamTacticalCard(teamB, rotationB, 'EQ. B', 'rose')}
            </div>
          )}

          {activeTab === 'teamA' && (
            <div className="max-w-2xl mx-auto w-full">
              {renderTeamTacticalCard(teamA, rotationA, 'EQ. A', 'cyan')}
            </div>
          )}

          {activeTab === 'teamB' && (
            <div className="max-w-2xl mx-auto w-full">
              {renderTeamTacticalCard(teamB, rotationB, 'EQ. B', 'rose')}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
