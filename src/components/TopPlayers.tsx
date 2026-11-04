
import React, { useState } from 'react';
import { Tournament, PlayerRole } from '../types';

interface TopPlayersProps {
  tournament: Tournament;
}

export const TopPlayers: React.FC<TopPlayersProps> = ({ tournament }) => {
  const [filterRole, setFilterRole] = useState<PlayerRole | 'ALL'>('ALL');
  const [sortMetric, setSortMetric] = useState<'points' | 'blocks' | 'aces' | 'mvps'>('points');

  // Flatten all players
  const allPlayers = tournament.teams.flatMap(t => 
    t.players.map(p => ({ ...p, teamName: t.name, teamLogo: t.logoUrl }))
  );

  // Filter
  const filteredPlayers = allPlayers.filter(p => filterRole === 'ALL' || p.role === filterRole);

  // Sort
  const sortedPlayers = filteredPlayers.sort((a, b) => b.stats[sortMetric] - a.stats[sortMetric]).slice(0, 10);

  const MetricCard = ({ label, metric, icon }: { label: string, metric: typeof sortMetric, icon: string }) => (
      <button 
        onClick={() => setSortMetric(metric)}
        className={`flex-1 p-3 rounded-lg border flex flex-col items-center gap-1 transition ${sortMetric === metric ? 'bg-corp-accent text-white border-corp-accent' : 'bg-black/20 text-slate-400 border-white/10 hover:bg-white/5'}`}
      >
          <span className="text-xl">{icon}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </button>
  );

  return (
    <div className="space-y-6">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-corp-panel p-4 rounded-xl border border-white/5">
             <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-thin">
                 <button onClick={() => setFilterRole('ALL')} className={`px-3 py-1.5 rounded text-xs font-bold uppercase whitespace-nowrap ${filterRole === 'ALL' ? 'bg-white text-black' : 'bg-black/40 text-slate-400 hover:text-white'}`}>Todos</button>
                 {Object.values(PlayerRole).map(role => (
                     <button key={role} onClick={() => setFilterRole(role)} className={`px-3 py-1.5 rounded text-xs font-bold uppercase whitespace-nowrap ${filterRole === role ? 'bg-white text-black' : 'bg-black/40 text-slate-400 hover:text-white'}`}>{role}</button>
                 ))}
             </div>
             <div className="flex gap-2 w-full md:w-auto">
                 <MetricCard label="Puntos" metric="points" icon="🏐" />
                 <MetricCard label="Bloqueos" metric="blocks" icon="✋" />
                 <MetricCard label="Aces" metric="aces" icon="⚡" />
                 <MetricCard label="MVP" metric="mvps" icon="⭐" />
             </div>
        </div>

        {/* List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedPlayers.map((player, index) => (
                <div key={player.id} className="bg-corp-panel border border-white/10 p-4 rounded-xl flex items-center justify-between hover:border-corp-accent/30 transition group relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-corp-accent to-transparent opacity-50"></div>
                    
                    <div className="flex items-center gap-4">
                        <div className="text-2xl font-black text-white/20 w-8 text-center italic">{index + 1}</div>
                        <div className="w-12 h-12 bg-black rounded-full border border-white/10 overflow-hidden">
                             {player.profile?.photoUrl ? <img src={player.profile.photoUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">{player.name[0]}</div>}
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-sm">{player.name}</h3>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                {player.teamLogo && <img src={player.teamLogo} className="w-3 h-3 object-contain" />}
                                <span className="uppercase font-bold text-[10px]">{player.teamName}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                                <span>{player.role || 'Jugador'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-end">
                        <span className="text-3xl font-black text-corp-accent italic tracking-tighter leading-none">{player.stats[sortMetric]}</span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{sortMetric}</span>
                    </div>
                </div>
            ))}
            {sortedPlayers.length === 0 && (
                <div className="col-span-full py-10 text-center text-slate-500 font-bold uppercase text-xs">No hay estadísticas registradas para este filtro</div>
            )}
        </div>
    </div>
  );
};
