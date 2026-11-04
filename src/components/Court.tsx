
import React from 'react';
import { Player } from '../types';
import { POSITIONS_LAYOUT } from '../constants';

interface CourtProps {
  players: (Player | null)[]; // Must be 6 players, can be null
  serving: boolean; // Is this side serving?
  teamName: string;
  rotationError?: boolean;
  variant?: 'default' | 'referee' | 'presentation'; // New prop to control sizing
  isVertical?: boolean; // New prop for vertical orientation
}

export const Court: React.FC<CourtProps> = ({ players = [], serving, teamName, rotationError, variant = 'default', isVertical = false }) => {
  const safePlayers = Array.isArray(players) ? players : [];
  const isReferee = variant === 'referee';

  const getVerticalGrid = (pos: number) => {
      switch(pos) {
          case 4: return 'row-start-1 col-start-2';
          case 3: return 'row-start-2 col-start-2';
          case 2: return 'row-start-3 col-start-2';
          case 5: return 'row-start-1 col-start-1';
          case 6: return 'row-start-2 col-start-1';
          case 1: return 'row-start-3 col-start-1';
          default: return '';
      }
  };

  if (isReferee) {
      return (
          <div className={`p-2 rounded w-full bg-[#2a7df5] ring-2 ring-blue-400 ${rotationError ? 'animate-pulse ring-red-500' : ''}`}>
              <div className="flex justify-between items-center mb-2 px-1">
                  <span className="font-black text-white italic text-lg tracking-wider">{teamName || 'Equipo'}</span>
                  {serving && (
                      <div className="flex items-center gap-2 bg-[#ffd529] px-2 py-0.5 rounded shadow">
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-600"></span>
                          <span className="text-black font-black text-[10px] tracking-widest uppercase">Saque</span>
                      </div>
                  )}
              </div>
              <div className="bg-[#f28e46] border-[3px] border-white relative h-48 sm:h-64 shadow-inner">
                  {/* Attack line */}
                  <div className="absolute top-1/2 left-0 right-0 h-1 bg-white/60 -translate-y-1/2"></div>
                  {/* Service line */}
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 border-b-[6px] border-dashed border-white/50 w-full mb-1"></div>
                  
                  {/* Player Grid matching Image 1: Top = 4,3,2 | Bottom = 5,6,1 */}
                  <div className="grid h-full grid-cols-3 grid-rows-2">
                       {POSITIONS_LAYOUT.map((layout) => {
                           const playerByIndex = safePlayers[layout.pos - 1];
                           return (
                               <div key={layout.pos} className={`${layout.grid} relative flex flex-col items-center justify-center p-1 border border-white/10`}>
                                   <span className="absolute top-1 right-2 font-black text-black/20 text-[10px]">{layout.pos}</span>
                                   {playerByIndex ? (
                                       <div className="flex flex-col items-center mt-2">
                                           <div className={`w-8 sm:w-10 h-8 sm:h-10 rounded-full flex items-center justify-center text-white font-black border-2 border-white text-sm sm:text-base shadow-md ${playerByIndex.name === 'Libero' ? 'bg-[#18233f] ring-2 ring-yellow-400' : 'bg-[#18233f]'}`}>
                                               {playerByIndex.number}
                                           </div>
                                           <div className="-mt-1 px-3 py-0.5 bg-[#6b5036] rounded-sm text-white font-black uppercase text-[8px] sm:text-[9px] tracking-widest shadow-md">
                                               {playerByIndex.name.split(' ')[0]}
                                           </div>
                                       </div>
                                   ) : (
                                       <span className="text-black/30 text-[10px] uppercase font-bold mt-4">N/A</span>
                                   )}
                               </div>
                           );
                       })}
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className={`
        relative overflow-hidden rounded shadow-2xl transition-all
        ${rotationError ? 'ring-4 ring-red-500' : 'ring-1 ring-white/10'}
        ${isReferee ? 'bg-court-out p-1' : 'bg-court-out p-4'}
        ${isVertical ? 'flex-1' : ''}
    `}>
      {/* Team Header inside Court Area */}
      <div className={`flex justify-between items-center px-2 ${isReferee ? 'mb-1' : 'mb-3'} ${isVertical ? 'flex-col items-start gap-1 mb-2' : ''}`}>
        <span className={`font-black text-white uppercase italic tracking-wider drop-shadow-md truncate max-w-[70%] ${isReferee ? 'text-xl' : 'text-lg'} ${isVertical ? 'text-xs w-full text-center' : ''}`}>{teamName || 'Equipo'}</span>
        {serving && (
            <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-400 animate-ping"></span>
                <span className={`bg-yellow-400 text-black rounded font-black uppercase tracking-widest shadow-lg ${isReferee ? 'text-xs px-3 py-1' : 'text-[10px] px-2 py-0.5'}`}>Saque</span>
            </div>
        )}
      </div>

      {/* The Actual Court (Orange Area) */}
      <div className={`bg-court-main border-4 border-white relative shadow-[inset_0_0_20px_rgba(0,0,0,0.2)] 
          ${isReferee ? 'h-64 md:h-[400px]' : (variant === 'presentation' ? 'h-80 md:h-[450px]' : isVertical ? 'h-[280px] w-full' : 'h-64 sm:h-80')}
      `}>
        
        {/* Attack Line (3m) */}
        {isVertical ? (
            <div className="absolute left-1/3 top-0 bottom-0 w-1 bg-white/80"></div>
        ) : (
            <div className="absolute top-1/3 left-0 right-0 h-2 bg-white/80"></div>
        )}
        
        {/* Center Line (Bottom/Right of this half) */}
        {isVertical ? (
            <div className="absolute right-0 top-0 bottom-0 w-0 border-r-4 border-dashed border-white/50 h-full"></div>
        ) : (
            <div className="absolute bottom-0 left-0 right-0 h-0 border-b-4 border-dashed border-white/50 w-full"></div>
        )}

        {/* Players Grid */}
        <div className={`grid h-full ${isVertical ? 'grid-cols-2 grid-rows-3' : 'grid-cols-3 grid-rows-2'}`}>
            {POSITIONS_LAYOUT.map((layout) => {
               // Safe access to player
               const playerByIndex = safePlayers[layout.pos - 1]; // Correct mapping based on standard rotation array index 0=P1
               const gridClass = isVertical ? getVerticalGrid(layout.pos) : layout.grid;
               
               return (
                <div 
                  key={layout.pos} 
                  className={`${gridClass} flex flex-col items-center justify-center relative group border border-white/5`}
                >
                  {/* Position Marker on Floor */}
                  <span className={`absolute top-1 right-1 font-black text-black/20 ${isReferee ? 'text-2xl md:text-4xl' : isVertical ? 'text-[8px]' : 'text-[9px]'}`}>{layout.pos}</span>

                  {playerByIndex ? (
                    <div className="flex flex-col items-center z-10 transform transition group-hover:scale-105 w-full px-1">
                      <div className={`
                        rounded-full flex items-center justify-center 
                        font-black shadow-[0_4px_6px_rgba(0,0,0,0.3)] border-2 border-white overflow-hidden
                        ${!playerByIndex.profile?.photoUrl ? (playerByIndex.name === 'Libero' ? 'bg-yellow-400 text-black' : 'bg-[#18233f] text-white') : 'bg-black'}
                        ${isReferee ? 'w-12 h-12 text-xl md:w-20 md:h-20 md:text-3xl mb-1 md:mb-2' : (variant === 'presentation' ? 'w-16 h-16 sm:w-24 sm:h-24 text-2xl border-4' : isVertical ? 'w-8 h-8 text-xs' : 'w-12 h-12 sm:w-16 sm:h-16 text-lg')}
                      `}>
                        {playerByIndex.profile?.photoUrl ? (
                            <img src={playerByIndex.profile.photoUrl} className="w-full h-full object-cover" alt="" />
                        ) : (
                            playerByIndex.number
                        )}
                      </div>
                      <div className={`
                        px-2 py-0.5 mt-1 bg-black/80 backdrop-blur-sm rounded text-white font-bold uppercase tracking-wide truncate max-w-full text-center shadow-lg
                        ${isReferee ? 'text-xs md:text-sm w-full' : (variant === 'presentation' ? 'text-[10px] md:text-sm max-w-[120px] px-3 py-1' : isVertical ? 'text-[8px] max-w-[60px]' : 'text-[9px] max-w-[80px] leading-tight')}
                      `}>
                        {playerByIndex.name.split(' ')[0]}
                      </div>
                    </div>
                  ) : (
                    <span className="text-black/30 font-bold text-xs uppercase">Vacío</span>
                  )}
                </div>
               );
            })}
        </div>
      </div>
    </div>
  );
};
