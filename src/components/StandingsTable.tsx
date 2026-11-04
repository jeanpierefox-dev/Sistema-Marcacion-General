
import React from 'react';
import { Tournament } from '../types';

interface StandingsTableProps {
  tournament: Tournament;
}

interface TeamStats {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}

export const StandingsTable: React.FC<StandingsTableProps> = ({ tournament }) => {
  
  const renderTable = (groupName: string, teamIds: string[]) => {
      const stats: Record<string, TeamStats> = {};
      
      // Initialize stats for teams in this group
      teamIds.forEach(tid => {
          const t = tournament.teams.find(team => team.id === tid);
          if (t) {
            stats[tid] = {
              teamId: tid, played: 0, won: 0, lost: 0, points: 0,
              setsWon: 0, setsLost: 0, pointsWon: 0, pointsLost: 0
            };
          }
      });

      // Calculate based on finished fixtures for this group
      if (tournament.fixtures) {
          tournament.fixtures.filter(f => f.group === groupName || groupName === 'General').forEach(fix => {
            if (fix.status === 'finished' && fix.resultString) {
              const parts = fix.resultString.split('-');
              if (parts.length === 2) {
                  const scoreA = parseInt(parts[0]);
                  const scoreB = parseInt(parts[1]);
                  
                  const statsA = stats[fix.teamAId];
                  const statsB = stats[fix.teamBId];

                  // Only count if both teams are in this group (or if it's a general table)
                  if (statsA && statsB) {
                    statsA.played++;
                    statsB.played++;
                    statsA.setsWon += scoreA;
                    statsA.setsLost += scoreB;
                    statsB.setsWon += scoreB;
                    statsB.setsLost += scoreA;

                    const setDiff = Math.abs(scoreA - scoreB);

                    if (scoreA > scoreB) {
                      statsA.won++;
                      statsB.lost++;
                      if (setDiff >= 2) {
                        statsA.points += 3;
                      } else {
                        statsA.points += 2;
                        statsB.points += 1;
                      }
                    } else {
                      statsB.won++;
                      statsA.lost++;
                      if (setDiff >= 2) {
                        statsB.points += 3;
                      } else {
                        statsB.points += 2;
                        statsA.points += 1;
                      }
                    }
                  }
              }
            }
          });
      }

      const sortedStats = Object.values(stats).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const ratioA = a.setsLost === 0 ? (a.setsWon > 0 ? 1000 : 0) : a.setsWon / a.setsLost;
        const ratioB = b.setsLost === 0 ? (b.setsWon > 0 ? 1000 : 0) : b.setsWon / b.setsLost;
        return ratioB - ratioA;
      });

      return (
        <div key={groupName} className="mb-8">
            <h3 className="text-xl font-bold text-white uppercase italic tracking-tighter mb-4 border-l-4 border-vnl-accent pl-3">{groupName}</h3>
            <div className="overflow-x-auto rounded-xl border border-white/10 shadow-xl bg-corp-panel">
              <table className="w-full text-sm text-left">
                <thead className="bg-black/40 text-slate-400 uppercase font-bold text-[10px] tracking-widest border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-center">#</th>
                    <th className="px-4 py-3">Equipo</th>
                    <th className="px-4 py-3 text-center text-white">PTS</th>
                    <th className="px-4 py-3 text-center">PJ</th>
                    <th className="px-4 py-3 text-center text-green-400">PG</th>
                    <th className="px-4 py-3 text-center text-red-400">PP</th>
                    <th className="px-4 py-3 text-center">Sets</th>
                    <th className="px-4 py-3 text-center">Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sortedStats.map((row, index) => {
                    const team = tournament.teams?.find(t => t.id === row.teamId);
                    if (!team) return null;
                    const setRatio = row.setsLost === 0 ? (row.setsWon > 0 ? 'MAX' : '-') : (row.setsWon / row.setsLost).toFixed(2);

                    return (
                      <tr key={row.teamId} className="hover:bg-white/5 transition">
                        <td className="px-4 py-3 text-center font-bold text-slate-500">{index + 1}</td>
                        <td className="px-4 py-3 font-bold text-white flex items-center gap-3">
                          {team.logoUrl ? <img src={team.logoUrl} className="w-6 h-6 object-contain" /> : <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-[10px]">{team.name[0]}</div>}
                          {team.name}
                        </td>
                        <td className="px-4 py-3 text-center font-black text-corp-accent text-lg">{row.points}</td>
                        <td className="px-4 py-3 text-center font-mono">{row.played}</td>
                        <td className="px-4 py-3 text-center font-mono text-green-500">{row.won}</td>
                        <td className="px-4 py-3 text-center font-mono text-red-500">{row.lost}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{row.setsWon}-{row.setsLost}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs text-slate-400">{setRatio}</td>
                      </tr>
                    );
                  })}
                  {sortedStats.length === 0 && (
                     <tr>
                         <td colSpan={8} className="text-center py-6 text-slate-500 text-xs font-bold uppercase">No hay equipos registrados</td>
                     </tr>
                  )}
                </tbody>
              </table>
            </div>
        </div>
      );
  };

  const groupKeys = Object.keys(tournament.groups || {});
  
  if (groupKeys.length > 0) {
      return <div>{groupKeys.map(key => renderTable(key, tournament.groups[key]))}</div>;
  }

  // Fallback for tournaments without groups (Legacy)
  return renderTable('General', tournament.teams.map(t => t.id));
};
