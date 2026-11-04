
import React from 'react';
import { MatchSet, Team, PointLog } from '../types';
import { calculateSetWinProbability } from '../services/volleyballPrediction';

interface SetStatsModalProps {
  setNumber: number;
  setData: MatchSet;
  teamA: Team;
  teamB: Team;
  onClose: () => void;
  onNextSet?: () => void; // Function to trigger next set
  showNextButton?: boolean; // Condition to show the button
  onShowOnTV?: () => void; // Function to trigger showing stats on TV
  onHideFromTV?: () => void; // Add hide from TV button
}

export const SetStatsModal: React.FC<SetStatsModalProps> = ({ setNumber, setData, teamA, teamB, onClose, onNextSet, showNextButton, onShowOnTV, onHideFromTV }) => {
  
  const calculateStats = (teamId: string, opponentId: string, history: PointLog[]) => {
      if (!history) return { total: 0, attack: 0, block: 0, ace: 0, opponentErrors: 0, errorsMade: 0, yellow: 0, red: 0 };

      // Points scored BY this team (Attack, Block, Ace)
      const ownPoints = history.filter(h => h.teamId === teamId && h.type !== 'opponent_error' && h.type !== 'yellow_card' && h.type !== 'red_card');
      const attack = ownPoints.filter(h => h.type === 'attack').length;
      const block = ownPoints.filter(h => h.type === 'block').length;
      const ace = ownPoints.filter(h => h.type === 'ace').length;
      
      // Cards
      const yellow = history.filter(h => h.teamId === teamId && h.type === 'yellow_card').length;
      const red = history.filter(h => h.teamId === teamId && h.type === 'red_card').length;

      // Points gained because OPPONENT made an error OR received a red card (penalty)
      const opponentErrors = history.filter(h => h.teamId === teamId && h.type === 'opponent_error').length;
      const opponentRedCards = history.filter(h => h.teamId === opponentId && h.type === 'red_card').length; // Points from opponent red card logic
      
      // Total Points for this team in this set
      const total = attack + block + ace + opponentErrors + opponentRedCards;

      // Errors made BY this team (Points for Opponent where type is opponent_error)
      const errorsMade = history.filter(h => h.teamId === opponentId && h.type === 'opponent_error').length;

      return { total, attack, block, ace, opponentErrors, errorsMade, yellow, red };
  };

  const statsA = calculateStats(teamA.id, teamB.id, setData.history || []);
  const statsB = calculateStats(teamB.id, teamA.id, setData.history || []);

  const setProb = calculateSetWinProbability({
      scoreA: setData.scoreA || 0,
      scoreB: setData.scoreB || 0,
      currentSet: setNumber,
      teamAId: teamA.id,
      teamBId: teamB.id,
      history: setData.history || []
  });

  return (
    <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 backdrop-blur-md">
        {/* Changed max-w-2xl to max-w-lg for compactness */}
        <div className="bg-vnl-panel border border-white/20 rounded-xl shadow-[0_0_100px_rgba(6,182,212,0.1)] w-full max-w-lg animate-in zoom-in-95 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header Compact */}
            <div className="bg-black/40 p-3 flex justify-between items-center border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="bg-red-600 text-[10px] font-black px-2 py-0.5 uppercase tracking-widest shadow-[0_0_10px_red] rounded">Set {setNumber}</span>
                    <span className="font-bold text-sm uppercase text-slate-300">Resumen</span>
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-white font-bold text-lg transition px-2">✕</button>
            </div>

            {/* Score Summary - Made smaller */}
            <div className="flex justify-between items-center bg-gradient-to-r from-blue-900/20 to-vnl-accent/5 p-4 border-b border-white/5 relative overflow-hidden shrink-0">
                 
                 {/* Team A */}
                 <div className="flex flex-col items-center w-1/3 z-10">
                      {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-12 h-12 object-contain drop-shadow-lg" /> : <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white font-black text-xl border border-white/10">{teamA.name[0]}</div>}
                      <span className="font-bold text-white uppercase mt-2 text-center leading-none text-xs tracking-tight truncate w-full">{teamA.name}</span>
                 </div>
                 
                 {/* Score - Reduced size */}
                 <div className="text-4xl font-mono font-black text-white tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] z-10">
                     {setData.scoreA}-{setData.scoreB}
                 </div>

                 {/* Team B */}
                 <div className="flex flex-col items-center w-1/3 z-10">
                      {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-12 h-12 object-contain drop-shadow-lg" /> : <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white font-black text-xl border border-white/10">{teamB.name[0]}</div>}
                      <span className="font-bold text-white uppercase mt-2 text-center leading-none text-xs tracking-tight truncate w-full">{teamB.name}</span>
                 </div>
            </div>

            {/* Win Probability & Control Indicator */}
            <div className="bg-black/50 px-4 py-2.5 border-b border-white/10 shrink-0">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider mb-1">
                    <span className="text-cyan-400 flex items-center gap-1">
                        {teamA.name.substring(0,3)} {setProb.probA}%
                        {setProb.momentum === 'A' && <span className="text-[9px] bg-cyan-500/20 px-1 rounded text-cyan-300">🔥 Racha</span>}
                    </span>
                    <span className="text-slate-400 text-[9px] font-bold tracking-widest uppercase">Probabilidad de Set</span>
                    <span className="text-rose-400 flex items-center gap-1">
                        {setProb.momentum === 'B' && <span className="text-[9px] bg-rose-500/20 px-1 rounded text-rose-300">🔥 Racha</span>}
                        {setProb.probB}% {teamB.name.substring(0,3)}
                    </span>
                </div>
                <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden flex border border-white/10 shadow-inner">
                    <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700 relative" 
                        style={{ width: `${setProb.probA}%` }}
                    />
                    <div 
                        className="h-full bg-gradient-to-r from-red-500 to-rose-500 transition-all duration-700 relative" 
                        style={{ width: `${setProb.probB}%` }}
                    />
                </div>
                <div className="flex justify-between items-center text-[8px] text-slate-400 mt-1 font-bold">
                    <span>Faltan {setProb.pointsNeededA} pts</span>
                    <span className="text-white/60">Meta: {setProb.targetScore} pts</span>
                    <span>Faltan {setProb.pointsNeededB} pts</span>
                </div>
            </div>

            {/* Stats Table - Compact padding */}
            <div className="p-0 bg-black/20 overflow-y-auto">
                <table className="w-full text-center">
                    <thead className="bg-black/40 text-[9px] uppercase text-slate-500 font-bold tracking-widest border-b border-white/10 sticky top-0">
                        <tr>
                            <th className="py-2 w-1/3 text-right pr-6">{teamA.name.substring(0,3)}</th>
                            <th className="py-2 w-1/3 text-center text-vnl-accent">ESTADÍSTICA</th>
                            <th className="py-2 w-1/3 text-left pl-6">{teamB.name.substring(0,3)}</th>
                        </tr>
                    </thead>
                    <tbody className="text-white font-bold text-xs divide-y divide-white/5">
                        <tr className="hover:bg-white/5 transition">
                            <td className="py-2 text-right pr-6 text-base font-mono">
                                <span>{statsA.attack}</span>
                                <span className="text-[10px] text-slate-400 font-normal ml-1.5">
                                    ({statsA.total > 0 ? Math.round((statsA.attack / statsA.total) * 100) : 0}%)
                                </span>
                            </td>
                            <td className="py-2 text-slate-400 text-[9px] uppercase tracking-widest">Ataques</td>
                            <td className="py-2 text-left pl-6 text-base font-mono">
                                <span>{statsB.attack}</span>
                                <span className="text-[10px] text-slate-400 font-normal ml-1.5">
                                    ({statsB.total > 0 ? Math.round((statsB.attack / statsB.total) * 100) : 0}%)
                                </span>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition">
                            <td className="py-2 text-right pr-6 text-base font-mono text-blue-400">
                                <span>{statsA.block}</span>
                                <span className="text-[10px] text-blue-300/70 font-normal ml-1.5">
                                    ({statsA.total > 0 ? Math.round((statsA.block / statsA.total) * 100) : 0}%)
                                </span>
                            </td>
                            <td className="py-2 text-slate-400 text-[9px] uppercase tracking-widest">Bloqueos</td>
                            <td className="py-2 text-left pl-6 text-base font-mono text-blue-400">
                                <span>{statsB.block}</span>
                                <span className="text-[10px] text-blue-300/70 font-normal ml-1.5">
                                    ({statsB.total > 0 ? Math.round((statsB.block / statsB.total) * 100) : 0}%)
                                </span>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition">
                            <td className="py-2 text-right pr-6 text-base font-mono text-green-400">
                                <span>{statsA.ace}</span>
                                <span className="text-[10px] text-green-300/70 font-normal ml-1.5">
                                    ({statsA.total > 0 ? Math.round((statsA.ace / statsA.total) * 100) : 0}%)
                                </span>
                            </td>
                            <td className="py-2 text-slate-400 text-[9px] uppercase tracking-widest">Aces</td>
                            <td className="py-2 text-left pl-6 text-base font-mono text-green-400">
                                <span>{statsB.ace}</span>
                                <span className="text-[10px] text-green-300/70 font-normal ml-1.5">
                                    ({statsB.total > 0 ? Math.round((statsB.ace / statsB.total) * 100) : 0}%)
                                </span>
                            </td>
                        </tr>
                        <tr className="hover:bg-white/5 transition">
                            <td className="py-2 text-right pr-6 text-base font-mono text-red-500">
                                <span>{statsA.errorsMade}</span>
                                <span className="text-[10px] text-red-400/70 font-normal ml-1.5">
                                    ({statsB.total > 0 ? Math.round((statsA.errorsMade / statsB.total) * 100) : 0}%)
                                </span>
                            </td>
                            <td className="py-2 text-slate-400 text-[9px] uppercase tracking-widest">Errores</td>
                            <td className="py-2 text-left pl-6 text-base font-mono text-red-500">
                                <span>{statsB.errorsMade}</span>
                                <span className="text-[10px] text-red-400/70 font-normal ml-1.5">
                                    ({statsA.total > 0 ? Math.round((statsB.errorsMade / statsA.total) * 100) : 0}%)
                                </span>
                            </td>
                        </tr>
                        {/* Cards Row */}
                        {(statsA.yellow > 0 || statsB.yellow > 0 || statsA.red > 0 || statsB.red > 0) && (
                            <tr className="hover:bg-white/5 transition bg-yellow-900/10">
                                <td className="py-2 text-right pr-6 flex justify-end gap-1 items-center h-full">
                                    {statsA.red > 0 && <span className="bg-red-600 px-1.5 rounded text-white text-[10px]">{statsA.red}</span>}
                                    {statsA.yellow > 0 && <span className="bg-yellow-500 px-1.5 rounded text-black text-[10px]">{statsA.yellow}</span>}
                                </td>
                                <td className="py-2 text-slate-400 text-[9px] uppercase tracking-widest">Tarjetas</td>
                                <td className="py-2 text-left pl-6 flex gap-1 items-center h-full">
                                    {statsB.yellow > 0 && <span className="bg-yellow-500 px-1.5 rounded text-black text-[10px]">{statsB.yellow}</span>}
                                    {statsB.red > 0 && <span className="bg-red-600 px-1.5 rounded text-white text-[10px]">{statsB.red}</span>}
                                </td>
                            </tr>
                        )}
                        <tr className="bg-vnl-accent/10 border-t border-vnl-accent/20">
                            <td className="py-3 text-right pr-6 text-xl font-black text-vnl-accent">{statsA.total}</td>
                            <td className="py-3 text-white text-[9px] uppercase font-black tracking-widest">TOTAL</td>
                            <td className="py-3 text-left pl-6 text-xl font-black text-vnl-accent">{statsB.total}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            
            {/* Footer Actions */}
            <div className="bg-black/40 p-4 border-t border-white/10 shrink-0 flex flex-col gap-2">
                {showNextButton && onNextSet && (
                    <button 
                        onClick={onNextSet}
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-3 rounded uppercase tracking-wider text-sm shadow-lg hover:scale-[1.02] transition animate-pulse flex items-center justify-center gap-2"
                    >
                        <span>▶</span> Iniciar Siguiente Set
                    </button>
                )}
                
                <div className="flex gap-2">
                    {onShowOnTV && (
                        <button 
                            onClick={onShowOnTV}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold py-2 uppercase tracking-widest border border-blue-400/30 transition rounded flex items-center justify-center gap-1"
                        >
                            📺 Mostrar TV
                        </button>
                    )}
                    {onHideFromTV && (
                        <button 
                            onClick={onHideFromTV}
                            className="flex-1 bg-red-600/80 hover:bg-red-500 text-white text-[10px] font-bold py-2 uppercase tracking-widest border border-red-400/30 transition rounded flex items-center justify-center gap-1"
                        >
                            🚫 Quitar TV
                        </button>
                    )}
                    <button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-bold py-2 uppercase tracking-widest border border-white/10 transition rounded">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};
