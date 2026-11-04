import React from 'react';
import { Player, Team } from '../types';

interface RotationViewProps {
  teamA: Team;
  teamB: Team;
  rotationA: (Player | null)[];
  rotationB: (Player | null)[];
  isVertical: boolean;
}

export const RotationView: React.FC<RotationViewProps> = ({ teamA, teamB, rotationA, rotationB, isVertical }) => {
  const getPlayer = (rot: (Player | null)[], pos: number) => {
      if (!rot) return null;
      return rot[pos - 1]; // pos is 1..6
  };

  const renderPlayer = (p: Player | null, pos: number) => {
      if (!p) return (
          <div className="flex flex-col items-center justify-center relative w-16 h-16 md:w-20 md:h-20 opacity-30">
              <div className="w-10 h-10 border-2 border-white/20 rounded-full flex items-center justify-center text-white/30 text-xs">{pos}</div>
          </div>
      );

      return (
          <div className="flex flex-col items-center justify-center relative group w-16 md:w-20">
              <div className={`
                  w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center font-black shadow-[0_10px_20px_rgba(0,0,0,0.5)] border-2 z-10
                  ${p.profile?.photoUrl ? 'bg-black border-white' : (p.name === 'Libero' ? 'bg-yellow-400 text-black border-yellow-200' : 'bg-[#18233f] text-white border-[#4C8BFF]')}
              `}>
                  {p.profile?.photoUrl ? (
                      <img src={p.profile.photoUrl} className="w-full h-full object-cover rounded-full" alt="" />
                  ) : (
                      <span className="text-sm md:text-xl">{p.number}</span>
                  )}
              </div>
              <div className="mt-1.5 px-2 py-0.5 bg-black/80 backdrop-blur-sm rounded text-white font-bold uppercase tracking-wider truncate w-[130%] text-center shadow-lg text-[8px] md:text-[10px] border border-white/10 z-20">
                  {p.name.split(' ')[0]}
              </div>
          </div>
      );
  };

  return (
    <div className={`absolute inset-0 z-40 flex flex-col items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 pointer-events-none 
        ${isVertical ? 'rotate-90 origin-center' : ''}
    `}>
        <div className="absolute top-10 text-center animate-in slide-in-from-top-10 duration-500 z-50">
            <h2 className="text-2xl md:text-4xl font-black text-white italic tracking-[0.4em] drop-shadow-[0_0_20px_rgba(255,255,255,0.5)] uppercase">
                Alineaciones
            </h2>
        </div>

        <div className={`relative flex pointer-events-auto items-center justify-center
            ${isVertical 
                ? 'w-[85vh] h-[400px] scale-90' 
                : 'w-full max-w-[1000px] h-[450px] scale-[0.80] md:scale-95'
            }
        `}>
            {/* The Court Ground */}
            <div className="absolute inset-x-4 md:inset-x-12 top-12 bottom-12 bg-[#df6632] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-4 border-white/50 rounded flex">
                
                {/* Court Lines */}
                <div className="absolute inset-2 md:inset-4 border-4 border-white pointer-events-none"></div>
                {/* Net / Center Line */}
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-3 md:w-4 bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)] z-0 pointer-events-none flex items-center justify-center">
                   <div className="w-1 h-full bg-slate-300"></div>
                </div>
                
                {/* Attack Lines (3m) */}
                <div className="absolute top-2 md:top-4 bottom-2 md:bottom-4 left-[33.33%] w-1 md:w-1.5 bg-white pointer-events-none"></div>
                <div className="absolute top-2 md:top-4 bottom-2 md:bottom-4 right-[33.33%] w-1 md:w-1.5 bg-white pointer-events-none"></div>

                {/* Team A Graphic Logo Underlay */}
                <div className="absolute left-0 right-1/2 top-0 bottom-0 flex items-center justify-center opacity-10 pointer-events-none">
                    {teamA.logoUrl && <img src={teamA.logoUrl} className="w-1/2 h-1/2 object-contain grayscale" />}
                </div>
                {/* Team B Graphic Logo Underlay */}
                <div className="absolute left-1/2 right-0 top-0 bottom-0 flex items-center justify-center opacity-10 pointer-events-none">
                    {teamB.logoUrl && <img src={teamB.logoUrl} className="w-1/2 h-1/2 object-contain grayscale" />}
                </div>
            </div>

            {/* Players Layer */}
            <div className="absolute inset-x-4 md:inset-x-12 top-12 bottom-12 flex z-10 p-2 md:p-4">
                {/* Team A (Left) */}
                <div className="w-1/2 relative h-full">
                    <div className="absolute -top-16 left-0">
                       <span className="text-white font-black text-2xl md:text-4xl italic tracking-widest drop-shadow-lg uppercase">{teamA.name}</span>
                    </div>

                    <div className="w-full h-full grid grid-cols-2 grid-rows-3 gap-0">
                         {/* Row 1 (Top / Far side): 5 (back), 4 (front) */}
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationA, 5), 5)}</div>
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationA, 4), 4)}</div>
                         {/* Row 2 (Mid): 6 (back), 3 (front) */}
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationA, 6), 6)}</div>
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationA, 3), 3)}</div>
                         {/* Row 3 (Bottom / Near side): 1 (back), 2 (front) */}
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationA, 1), 1)}</div>
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationA, 2), 2)}</div>
                    </div>
                </div>

                {/* Team B (Right) */}
                <div className="w-1/2 relative h-full border-l-[1.5px] border-transparent">
                    <div className="absolute -top-16 right-0">
                       <span className="text-white font-black text-2xl md:text-4xl italic tracking-widest drop-shadow-lg uppercase">{teamB.name}</span>
                    </div>

                    <div className="w-full h-full grid grid-cols-2 grid-rows-3 gap-0">
                         {/* Row 1 (Top / Far side): 2 (front), 1 (back) */}
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationB, 2), 2)}</div>
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationB, 1), 1)}</div>
                         {/* Row 2 (Mid): 3 (front), 6 (back) */}
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationB, 3), 3)}</div>
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationB, 6), 6)}</div>
                         {/* Row 3 (Bottom / Near side): 4 (front), 5 (back) */}
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationB, 4), 4)}</div>
                         <div className="flex items-center justify-center">{renderPlayer(getPlayer(rotationB, 5), 5)}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

