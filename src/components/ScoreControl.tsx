
import React from 'react';
import { Player, UserRole } from '../types';
import { Court } from './Court';

interface ScoreControlProps {
  role: UserRole;
  linkedTeamId?: string;
  onPoint: (teamId: string, type: 'attack' | 'block' | 'ace' | 'opponent_error' | 'yellow_card' | 'red_card', playerId?: string) => void;
  onSubtractPoint?: (teamId: string) => void; 
  onRequestTimeout: (teamId: string) => void;
  onRequestSub: (teamId: string) => void;
  onModifyRotation: (teamId: string) => void;
  onSetServe: (teamId: string) => void;
  onToggleRotationView?: () => void; // New prop
  showRotationView?: boolean; // New prop
  teamId: string;
  teamName: string;
  players: Player[]; 
  disabled: boolean;
  timeoutsUsed: number;
  subsUsed: number;
  isServing: boolean;
}

export const ScoreControl: React.FC<ScoreControlProps> = ({
  role,
  linkedTeamId,
  onPoint,
  onSubtractPoint,
  onRequestTimeout,
  onRequestSub,
  onModifyRotation,
  onSetServe,
  onToggleRotationView,
  showRotationView,
  teamId,
  teamName,
  players,
  disabled,
  timeoutsUsed,
  subsUsed,
  isServing
}) => {
  const isAdmin = role === 'ADMIN' || role === 'MAIN_REFEREE';
  const isReferee = role === 'REFEREE';
  const isTeamCoach = (role === 'COACH_A' || role === 'COACH_B') && linkedTeamId === teamId; 
  
  const [selectedAction, setSelectedAction] = React.useState<'attack' | 'block' | 'ace' | 'opponent_error' | 'yellow_card' | 'red_card' | null>(null);

  if (!isAdmin && !isTeamCoach && !isReferee) return null;

  // --- REFEREE VIEW (Rotation List Only) ---
  if (isReferee) {
      return (
          <div className={`bg-black/40 backdrop-blur p-4 rounded-xl border ${isServing ? 'border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.1)]' : 'border-white/10'} h-full flex flex-col`}>
              <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-3">
                  <h3 className={`font-black text-lg uppercase tracking-wider ${isServing ? 'text-yellow-400' : 'text-white'}`}>{teamName}</h3>
                  <div className="flex items-center gap-2">
                      {isServing && <span className="text-[10px] font-bold bg-yellow-500 text-black px-2 py-0.5 rounded uppercase">Saque</span>}
                      {onToggleRotationView && (
                          <button 
                              onClick={onToggleRotationView}
                              className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${showRotationView ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_10px_blue]' : 'bg-black/40 border-white/10 text-slate-500 hover:text-white'}`}
                              title="Mostrar/Ocultar Gráfico de Rotación en Pantalla Completa"
                          >
                              <span className="text-xs font-black">R</span>
                          </button>
                      )}
                  </div>
              </div>
              
              <div className="flex-grow space-y-2 overflow-y-auto">
                  {/* Visual Court rotation view for Floor Referee */}
                  <div className="my-2 p-1 rounded bg-black/20 border border-white/5">
                      <Court 
                          players={players} 
                          serving={isServing}
                          teamName={teamName}
                          variant="referee"
                          isVertical={false}
                      />
                  </div>
                  
                  {/* Standard Rotation Display P1-P6 */}
                  <div className="grid grid-cols-2 gap-1 mt-2">
                      {players.map((p, i) => {
                          const pos = i + 1; // P1, P2...
                          const isServer = pos === 1 && isServing;
                          return (
                              <div 
                                key={p.id || i} 
                                className={`flex flex-col items-center p-1 rounded border transition-colors ${isServer ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-white/5 border-white/5'}`}
                              >
                                  <div className="flex items-center gap-1">
                                      <span className={`text-[10px] font-black ${isServer ? 'text-yellow-400' : 'text-slate-500'}`}>P{pos}</span>
                                      <span className={`font-mono font-bold text-xs ${p.name === 'Libero' ? 'text-yellow-200' : 'text-white'}`}>#{p.number}</span>
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-300 uppercase truncate max-w-[80px]">{p.name.split(' ')[0]}</span>
                              </div>
                          );
                      })}
                  </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-white/10 text-center">
                  <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Verificación de Rotación</p>
              </div>
          </div>
      );
  }

  // --- ADMIN & COACH VIEW ---
  return (
    <div className={`bg-vnl-panel/90 backdrop-blur p-2 md:p-5 rounded border shadow-xl transition-all duration-300 ${isServing ? 'border-yellow-400/50 shadow-[0_0_15px_rgba(250,204,21,0.1)]' : 'border-white/10'} ${disabled ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
      <div className="flex justify-between items-center border-b border-white/10 pb-2 md:pb-3 mb-2 md:mb-4">
          <div className="flex items-center gap-2 md:gap-3">
            {/* Manual Serve Toggle Button */}
            <button 
                onClick={() => isAdmin && onSetServe(teamId)}
                disabled={!isAdmin || disabled}
                className={`w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center border transition-all ${isServing ? 'bg-yellow-400 border-yellow-500 text-black shadow-[0_0_10px_yellow]' : 'bg-black/40 border-white/10 text-slate-600 grayscale hover:grayscale-0'}`}
                title={isAdmin ? "Click para asignar saque" : "Indicador de Saque"}
            >
                <span className="text-[10px] md:text-sm">🏐</span>
            </button>
            
            <h3 className={`font-bold text-sm md:text-lg uppercase tracking-wider ${isServing ? 'text-yellow-400' : 'text-white'} truncate max-w-[120px] md:max-w-none`}>{teamName}</h3>
            
            {isAdmin && onSubtractPoint && !disabled && (
              <button 
                onClick={() => onSubtractPoint(teamId)}
                className="bg-red-900/30 hover:bg-red-800 text-red-400 w-5 h-5 md:w-6 md:h-6 rounded flex items-center justify-center text-[10px] md:text-xs font-bold border border-red-500/20 transition ml-1 md:ml-2"
                title="Restar Punto"
              >
                -1
              </button>
            )}
            
            {/* Rotation View Toggle (Admin) */}
            {(role === 'ADMIN' || role === 'MAIN_REFEREE') && onToggleRotationView && (
                <button 
                    onClick={onToggleRotationView}
                    className={`ml-1 md:ml-2 w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center border transition-all ${showRotationView ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_10px_blue]' : 'bg-black/40 border-white/10 text-slate-500 hover:text-white'}`}
                    title="Mostrar/Ocultar Rotación en Pantalla"
                >
                    <span className="text-[10px] font-black">R</span>
                </button>
            )}
          </div>
          {(isAdmin || isTeamCoach) && (
              <button 
                onClick={() => onModifyRotation(teamId)}
                className="text-[9px] md:text-[10px] bg-white/10 hover:bg-white/20 text-slate-300 px-2 py-1 flex-shrink-0 md:px-3 rounded border border-white/10 transition uppercase font-bold tracking-wider"
                disabled={disabled}
              >
                Rotación
              </button>
          )}
      </div>
      
      {isAdmin ? (
        <div className="space-y-2 md:space-y-4">
          {/* Quick Point Button */}
          <button 
            onClick={() => onPoint(teamId, 'opponent_error')}
            disabled={disabled}
            className="w-full bg-corp-accent hover:bg-corp-accent-hover text-white py-2 md:py-4 rounded md:rounded-lg font-black text-sm md:text-xl shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2 mb-1 md:mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-lg md:text-2xl">+</span> PUNTO DIRECTO
          </button>

          <div className="grid grid-cols-2 gap-2 md:gap-3">
             <button 
                onClick={() => setSelectedAction('attack')}
                disabled={disabled}
                className={`p-2 md:p-3 rounded text-[10px] md:text-sm font-black uppercase tracking-wider transition border-l-2 md:border-l-4 ${selectedAction === 'attack' ? 'bg-white text-black border-vnl-accent' : 'bg-black/40 text-slate-300 border-transparent hover:bg-black/60'}`}
             >
               Ataque
             </button>
             <button 
                onClick={() => setSelectedAction('block')}
                disabled={disabled}
                className={`p-2 md:p-3 rounded text-[10px] md:text-sm font-black uppercase tracking-wider transition border-l-2 md:border-l-4 ${selectedAction === 'block' ? 'bg-white text-black border-blue-500' : 'bg-black/40 text-slate-300 border-transparent hover:bg-black/60'}`}
             >
               Bloqueo
             </button>
             <button 
                onClick={() => setSelectedAction('ace')}
                disabled={disabled}
                className={`p-2 md:p-3 rounded text-[10px] md:text-sm font-black uppercase tracking-wider transition border-l-2 md:border-l-4 ${selectedAction === 'ace' ? 'bg-white text-black border-green-500' : 'bg-black/40 text-slate-300 border-transparent hover:bg-black/60'}`}
             >
               Ace
             </button>
             <button 
                onClick={() => onPoint(teamId, 'opponent_error')}
                disabled={disabled}
                className="p-2 md:p-3 rounded text-[10px] md:text-sm font-black uppercase tracking-wider bg-red-900/50 text-red-200 border-l-2 md:border-l-4 border-red-500 hover:bg-red-900/80 transition"
             >
               Error Rival
             </button>
          </div>

          {/* Cards Section */}
          <div className="flex gap-2 border-t border-white/10 pt-2 md:pt-4">
              <button 
                onClick={() => setSelectedAction('yellow_card')}
                className={`flex-1 bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-300 border border-yellow-500/50 p-1 md:p-2 rounded text-[9px] md:text-[10px] font-black uppercase tracking-widest transition ${selectedAction === 'yellow_card' ? 'bg-yellow-500 text-black' : ''}`}
              >
                  🟨 Amarilla
              </button>
              <button 
                onClick={() => setSelectedAction('red_card')}
                className={`flex-1 bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/50 p-1 md:p-2 rounded text-[9px] md:text-[10px] font-black uppercase tracking-widest transition ${selectedAction === 'red_card' ? 'bg-red-600 text-white' : ''}`}
              >
                  🟥 Roja (+1)
              </button>
          </div>

          {selectedAction && (
            <div className="bg-black/40 p-2 md:p-3 rounded border border-white/10 animate-in fade-in slide-in-from-top-2">
              <div className="flex justify-between items-center mb-2 md:mb-3">
                <p className="text-[9px] md:text-[10px] text-vnl-accent uppercase tracking-widest font-bold">Seleccionar Jugador</p>
                <button onClick={() => setSelectedAction(null)} className="text-[9px] md:text-[10px] text-slate-500 font-bold uppercase hover:text-white">Cancelar</button>
              </div>
              <div className="grid grid-cols-4 md:grid-cols-5 gap-1 md:gap-2 max-h-32 md:max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                {players.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onPoint(teamId, selectedAction, p.id);
                      setSelectedAction(null);
                    }}
                    className="bg-white/5 border border-white/10 hover:bg-vnl-accent hover:text-black hover:border-vnl-accent text-white font-black py-1.5 md:py-2 text-[9px] md:text-sm rounded transition flex flex-col items-center justify-center truncate"
                    title={p.name}
                  >
                    <span>#{p.number}</span>
                    <span className="text-[7px] md:text-[9px] font-normal opacity-70 truncate w-full text-center px-1">{p.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
         <div className="text-center text-xs text-slate-400 italic mb-4 bg-black/20 p-4 rounded border border-white/5">
            <span className="block font-bold text-white mb-1 uppercase">Panel de Entrenador</span>
            Solo solicitudes permitidas.
         </div>
      )}

      {/* Coach/Admin Actions */}
      <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-3">
        <button
          onClick={() => onRequestTimeout(teamId)}
          disabled={disabled || timeoutsUsed >= 2}
          className="bg-yellow-600/80 hover:bg-yellow-500 disabled:opacity-30 disabled:grayscale text-white py-3 rounded text-sm font-black uppercase tracking-wider flex flex-col items-center shadow-lg transition"
        >
          <span>TIEMPO</span>
          <span className="text-[9px] font-normal opacity-90 mt-1">{timeoutsUsed}/2</span>
        </button>
        <button
          onClick={() => onRequestSub(teamId)}
          disabled={disabled || subsUsed >= 6}
          className="bg-blue-600/80 hover:bg-blue-500 disabled:opacity-30 disabled:grayscale text-white py-3 rounded text-sm font-black uppercase tracking-wider flex flex-col items-center shadow-lg transition"
        >
          <span>CAMBIO</span>
          <span className="text-[9px] font-normal opacity-90 mt-1">{subsUsed}/6</span>
        </button>
      </div>
    </div>
  );
};
