import React from 'react';
import { Tournament, Team, MatchFixture } from '../types';

export const TournamentBracket: React.FC<{ tournament: Tournament, resolveTeam: (id: string, teams: Team[]) => any | undefined }> = ({ tournament, resolveTeam }) => {
    // Basic Bracket Layout matching the user's reference image
    // Requires identifying Semifinals and Finals from fixtures
    
    const semifinals = tournament.fixtures.filter(f => f.group === 'Semifinal' || f.group === 'Semifinal 1' || f.group === 'Semifinal 2');
    const finals = tournament.fixtures.filter(f => f.group === 'Final');

    const renderMatchBox = (match?: MatchFixture, title?: string) => {
        if (!match) return (
             <div className="bg-white rounded-lg shadow min-w-[200px] border border-slate-200">
                {title && <div className="bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-t-lg">{title}</div>}
                <div className="flex justify-between p-3 border-b border-slate-100 text-slate-400"><span>TBD</span> <span>-</span></div>
                <div className="flex justify-between p-3 text-slate-400"><span>TBD</span> <span>-</span></div>
             </div>
        );

        const teamA = resolveTeam(match.teamAId, tournament.teams);
        const teamB = resolveTeam(match.teamBId, tournament.teams);
        
        const isLive = match.status === 'live';
        const isFinished = match.status === 'finished';
        
        let scoreA = 0; let scoreB = 0;
        if (match.resultString) {
             const pts = match.resultString.split('-');
             if (pts.length === 2) { scoreA = parseInt(pts[0]); scoreB = parseInt(pts[1]); }
        }

        return (
             <div className="bg-white rounded-lg shadow min-w-[200px] border border-slate-200 overflow-visible relative">
                {title && <div className={`${isLive ? 'bg-indigo-600' : 'bg-slate-200 text-slate-500'} text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-t-lg flex justify-between`}>
                    <span>{title}</span>
                    {isLive && <span className="animate-pulse">EN CURSO</span>}
                    {isFinished && <span>FINALIZADO</span>}
                </div>}
                <div className="flex flex-col relative z-10 bg-white rounded-b-lg p-2 gap-1">
                    <div className="flex justify-between items-center rounded px-2 py-1 text-slate-800 font-medium text-sm">
                        <span>{teamA?.name || 'TBD'}</span>
                        <span className={`font-bold ${match.winnerId === match.teamAId ? 'text-indigo-600' : ''}`}>{scoreA || 0}</span>
                    </div>
                    <div className="flex justify-between items-center rounded px-2 py-1 text-slate-800 font-medium text-sm">
                        <span>{teamB?.name || 'TBD'}</span>
                        <span className={`font-bold ${match.winnerId === match.teamBId ? 'text-indigo-600' : ''}`}>{scoreB || 0}</span>
                    </div>
                </div>
             </div>
        );
    };

    return (
        <div className="flex items-center gap-16 overflow-x-auto p-8 w-full font-sans pb-16 bg-slate-50/5 rounded-xl border border-white/10">
            {/* Semifinals Column */}
            <div className="flex flex-col gap-12 relative z-10 shrink-0">
                <div className="relative">
                    {renderMatchBox(semifinals[0], "SEMIFINAL 1")}
                    {semifinals[0] && (
                        <div className="absolute top-1/2 -right-8 w-8 h-px bg-slate-400/50"></div>
                    )}
                </div>
                <div className="relative">
                    {renderMatchBox(semifinals[1], "SEMIFINAL 2")}
                    {semifinals[1] && (
                        <div className="absolute top-1/2 -right-8 w-8 h-px bg-slate-400/50"></div>
                    )}
                </div>
                {semifinals.length > 0 && (
                    <div className="absolute top-1/4 bottom-1/4 -right-8 w-px bg-slate-400/50 my-auto"></div>
                )}
            </div>

            {/* Finals Column */}
            <div className="flex flex-col relative z-10 shrink-0">
               <div className="relative">
                    {semifinals.length > 0 && (
                        <div className="absolute top-1/2 -left-8 w-8 h-px bg-slate-400/50 border-t border-dashed border-slate-400"></div>
                    )}
                    <div className="bg-[#fff9e6] rounded-xl shadow-lg border border-yellow-400 min-w-[220px] relative pt-4 pb-2 px-2 mt-4 text-slate-800">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-300 text-yellow-900 text-xs font-black uppercase tracking-widest px-3 py-1 rounded shadow-sm">
                            GRAN FINAL
                        </div>
                        <div className="flex flex-col gap-0 relative z-10">
                            {finals[0] ? (
                                <>
                                    <div className="flex justify-between items-center px-3 py-2 font-bold text-sm border-b border-yellow-200">
                                        <span>{resolveTeam(finals[0].teamAId, tournament.teams)?.name || 'TBD'}</span>
                                        <span>{finals[0].resultString ? finals[0].resultString.split('-')[0] : '0'}</span>
                                    </div>
                                    <div className="flex justify-between items-center px-3 py-2 font-bold text-sm">
                                        <span>{resolveTeam(finals[0].teamBId, tournament.teams)?.name || 'TBD'}</span>
                                        <span>{finals[0].resultString ? finals[0].resultString.split('-')[1] : '0'}</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex justify-between items-center px-3 py-2 font-bold text-sm border-b border-yellow-200">
                                        <span>TBD</span>
                                    </div>
                                    <div className="flex justify-between items-center px-3 py-2 font-bold text-sm">
                                        <span>TBD</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
               </div>
            </div>
        </div>
    );
};
