import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Court } from './components/Court';
import { ScoreControl } from './components/ScoreControl';
import { Login } from './components/Login';
import TVOverlay from './components/TVOverlay';
import { VARTransmitter } from './components/VARTransmitter';
import { UserManagement } from './components/UserManagement';
import { SetStatsModal } from './components/SetStatsModal';
import { CloudConfig } from './components/CloudConfig';
import { StandingsTable } from './components/StandingsTable'; 
import { TopPlayers } from './components/TopPlayers'; 
import { TournamentBracket } from './components/TournamentBracket';
import { ProfileEditor } from './components/ProfileEditor';
import { StreamGuideModal } from './components/StreamGuideModal';
import { ImageSelectorModal } from './components/ImageSelectorModal';
import { 
  Tournament, Team, LiveMatchState, 
  Player, PlayerRole, MatchSet, RequestItem, User, MatchConfig
} from './types';
import { generateSmartFixture, generateBasicFixture } from './services/geminiService';
import { initCloud, syncData, pushData, loadConfig, checkForSyncLink, resetCloudData } from './services/cloud';

// --- HELPERS ---
const createEmptyPlayer = (id: string, number: number, role?: PlayerRole): Player => {
  return {
    id,
    name: `Jugador ${number}`,
    number,
    role: role || PlayerRole.OutsideHitter,
    isCaptain: false,
    stats: { points: 0, aces: 0, blocks: 0, errors: 0, matchesPlayed: 0, mvps: 0, yellowCards: 0, redCards: 0 },
    profile: {
      bio: "",
      height: 180,
      weight: 75,
      achievements: [],
      photoUrl: ""
    }
  };
};

const getAssignedRole = (index: number): PlayerRole => {
    if (index === 0 || index === 1) return PlayerRole.Setter; // 1, 2
    if (index >= 2 && index <= 5) return PlayerRole.OutsideHitter; // 3, 4, 5, 6
    if (index === 6 || index === 7) return PlayerRole.Opposite; // 7, 8
    if (index >= 8 && index <= 10) return PlayerRole.MiddleBlocker; // 9, 10, 11
    return PlayerRole.Libero; // 12+
};

// Initial Admin User
const DEFAULT_ADMIN: User = { id: 'admin', username: 'admin', password: '1234', role: 'ADMIN' };

const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const App: React.FC = () => {
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Check for 'view' param in URL on mount to bypass login for viewers
  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const viewMatchId = params.get('view');
      if (viewMatchId) {
          // Create a temporary guest viewer user
          const guestUser: User = { id: 'guest-' + Date.now(), username: 'Espectador', role: 'VIEWER' };
          setCurrentUser(guestUser);
          // We will let the auto-sync logic handle the rest (setting active tournament and match)
          // But we need to ensure the match ID is set in a way that the sync logic picks it up
          // Actually, the sync logic relies on 'liveMatch' from cloud. 
          // If we are just a viewer, we need to wait for cloud sync.
          // But we can set a flag or state to auto-navigate once data loads.
      }
  }, []);

  const isAdmin = currentUser?.role === 'ADMIN';
  const isMainReferee = currentUser?.role === 'MAIN_REFEREE';
  // Privilege Check for Match Control (Admin or Main Referee)
  const canControlMatch = isAdmin || isMainReferee;
  
  // Navigation
  const [currentView, setCurrentView] = useState('home'); 
  
  // App Data State
  const [users, setUsers] = useState<User[]>([DEFAULT_ADMIN]);
  const [registeredTeams, setRegisteredTeams] = useState<Team[]>(() => {
    try {
      const cached = localStorage.getItem('vnl_registered_teams');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });
  
  // Tournament State
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
  
  const activeTournament = tournaments.find(t => t.id === activeTournamentId) || null;

  const [liveMatch, setLiveMatch] = useState<LiveMatchState | null>(null);
  
  // UI States
  const [swapSides, setSwapSides] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [isTransmitterMode, setIsTransmitterMode] = useState(false);
  const [showBracket, setShowBracket] = useState(true);
  const [showStreamGuide, setShowStreamGuide] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isVertical, setIsVertical] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsVertical(window.innerWidth < window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [loading, setLoading] = useState(false);
  const [viewingSetStats, setViewingSetStats] = useState<{setNum: number, data: MatchSet} | null>(null);
  
  // Match Config Modal
  const [showMatchConfigModal, setShowMatchConfigModal] = useState<string | null>(null); // holds fixtureId or 'LIVE_EDIT'
  const [matchConfig, setMatchConfig] = useState<MatchConfig>({ maxSets: 3, pointsPerSet: 25, tieBreakPoints: 15 });
  const [matchConfigMode, setMatchConfigMode] = useState<'control' | 'preview'>('control');
  const [isEditingRules, setIsEditingRules] = useState(false);

  // Create Tournament Modal State
  const [showCreateTourneyModal, setShowCreateTourneyModal] = useState(false);
  const [newTourneyData, setNewTourneyData] = useState({
      name: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
      logoUrl: '',
      matchDays: [] as string[],
      format: 'LEAGUE' as 'LEAGUE' | 'GROUPS' | 'KNOCKOUT_4',
      knockout: 'SEMIS' as 'SEMIS' | 'FINAL' | 'NONE'
  });
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  
  // Modals
  const [showSubModal, setShowSubModal] = useState<{teamId: string} | null>(null);
  const [showRotationModal, setShowRotationModal] = useState<{teamId: string} | null>(null);
  const [showCloudConfig, setShowCloudConfig] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(false);

  const [subPlayerOutNum, setSubPlayerOutNum] = useState('');
  const [subPlayerInNum, setSubPlayerInNum] = useState('');
  const [rotationInput, setRotationInput] = useState<string[]>(Array(6).fill('')); 

  // New Team Form State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCoach, setNewTeamCoach] = useState('');
  const [newTeamLogo, setNewTeamLogo] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#1e3a8a');
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [showTeamLogoModal, setShowTeamLogoModal] = useState(false);
  const [showTourneyLogoModal, setShowTourneyLogoModal] = useState(false);

  // Auto-Start Countdown State
  const [nextSetCountdown, setNextSetCountdown] = useState<number | null>(null);

  // Player Stats Control Panel State
  const [statsPanelTeam, setStatsPanelTeam] = useState<string>('team_a');
  const [statsPanelPlayerId, setStatsPanelPlayerId] = useState<string>('');

  // Refs to track previous state for auto-opening modal
  const prevMatchStatus = useRef<string | undefined>(undefined);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.error(e));
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // --- CLOUD SYNC INITIALIZATION ---
  useEffect(() => {
    // Cloud Firestore is automatically active and shared across all devices
    setIsCloudConnected(true);
  }, []);

  // --- CLOUD SYNC LISTENERS ---
  useEffect(() => {
      // Always sync (WebSocket handles connection internally if no Firebase)
      const normalizeArray = <T,>(val: any): T[] => {
          if (!val) return [];
          if (Array.isArray(val)) return val.filter(i => !!i); 
          if (typeof val === 'object') return Object.values(val);
          return [];
      };
      const unsubUsers = syncData<any>('users', (val) => {
          const loadedUsers = normalizeArray<User>(val);
          if (loadedUsers.length > 0) {
              setUsers(loadedUsers);
          } else {
              setUsers([DEFAULT_ADMIN]);
              pushData('users', [DEFAULT_ADMIN]);
          }
      });
      const unsubTeams = syncData<any>('teams', (val) => {
          if (val === null || val === undefined) {
              const cached = localStorage.getItem('vnl_registered_teams');
              if (cached) {
                  try {
                      const parsed = JSON.parse(cached);
                      if (Array.isArray(parsed) && parsed.length > 0) {
                          setRegisteredTeams(parsed);
                          pushData('teams', parsed).catch(() => {});
                          return;
                      }
                  } catch (e) {}
              }
              return;
          }
          const loaded = normalizeArray<Team>(val).map(team => ({
              ...team,
              players: team.players || []
          }));
          setRegisteredTeams(loaded);
          try {
              localStorage.setItem('vnl_registered_teams', JSON.stringify(loaded));
          } catch (e) {}
      });
      const unsubTourneys = syncData<any>('tournaments', (val) => {
          const loaded = normalizeArray<Tournament>(val).map(t => ({
              ...t,
              teams: t.teams || [],
              fixtures: t.fixtures || []
          }));
          setTournaments(loaded);
      });
      const unsubLive = syncData<LiveMatchState | null>('liveMatch', (val) => setLiveMatch(val));
      return () => { unsubUsers(); unsubTeams(); unsubTourneys(); unsubLive(); };
  }, [isCloudConnected]);

  // --- VIEWER AUTO-SYNC LOGIC ---
  useEffect(() => {
      if ((currentUser?.role === 'VIEWER' || currentUser?.role === 'REFEREE') && liveMatch && tournaments.length > 0) {
          if (!activeTournamentId || activeTournamentId !== tournaments.find(t => t.fixtures?.some(f => f.id === liveMatch.matchId))?.id) {
               const foundT = tournaments.find(t => t.fixtures?.some(f => f.id === liveMatch.matchId));
               if (foundT) {
                   setActiveTournamentId(foundT.id);
               }
          }
          // Only auto-switch for VIEWERS who are already in match view or just logged in
          // Referees control their own navigation to avoid being forced out of rotation view
          if (currentUser?.role === 'VIEWER' && currentView !== 'match') setCurrentView('match');
          if (currentUser?.role === 'VIEWER' && !tvMode) setTvMode(true);
      }
  }, [liveMatch, currentUser, tournaments, activeTournamentId, currentView, tvMode]);

  // --- AUTOMATIC SET TRANSITION EFFECT & AUTO-OPEN MODAL ---
  useEffect(() => {
    // Auto-open stats modal when set finishes
    if (liveMatch?.status === 'finished_set' && prevMatchStatus.current !== 'finished_set') {
        const setIndex = liveMatch.currentSet - 1;
        if (liveMatch.sets[setIndex]) {
            setViewingSetStats({ setNum: liveMatch.currentSet, data: liveMatch.sets[setIndex] });
        }
    }
    prevMatchStatus.current = liveMatch?.status;

    let timer: any;
    // Only run auto-countdown if the modal is NOT open, to avoid conflict
    if (liveMatch?.status === 'finished_set' && currentUser?.role === 'ADMIN' && !viewingSetStats) {
        setNextSetCountdown(10); 
        timer = setInterval(() => {
            setNextSetCountdown(prev => {
                if (prev !== null && prev <= 1) {
                    clearInterval(timer);
                    handleStartNextSet(); 
                    return null;
                }
                return prev !== null ? prev - 1 : null;
            });
        }, 1000);
    } else {
        setNextSetCountdown(null);
    }
    return () => clearInterval(timer);
  }, [liveMatch?.status, viewingSetStats, currentUser?.role]);


  // --- SYNC HELPERS ---
  const updateUsers = (newUsers: User[]) => { setUsers(newUsers); pushData('users', newUsers); };
  const updateTeams = (newTeamsOrUpdater: Team[] | ((prev: Team[]) => Team[])) => {
      setRegisteredTeams(prev => {
          const nextTeams = typeof newTeamsOrUpdater === 'function' ? newTeamsOrUpdater(prev) : newTeamsOrUpdater;
          try {
              localStorage.setItem('vnl_registered_teams', JSON.stringify(nextTeams));
          } catch (e) {
              console.warn('Could not save teams to localStorage:', e);
          }
          pushData('teams', nextTeams).catch(err => {
              console.error('Failed to sync teams to cloud:', err);
          });
          return nextTeams;
      });
  };
  const updateTournaments = (newTourneys: Tournament[]) => { setTournaments(newTourneys); pushData('tournaments', newTourneys); };
  const updateLiveMatch = (update: LiveMatchState | null | ((prev: LiveMatchState | null) => LiveMatchState | null)) => {
      setLiveMatch(prev => {
          const newVal = update instanceof Function ? update(prev) : update;
          pushData('liveMatch', newVal);
          return newVal;
      });
  };
  
  const handleAddTeam = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newTeamName.trim();
    if (!trimmedName) return;
    
    if (editingTeamId) {
        updateTeams(prev => prev.map(t => {
            if (t.id === editingTeamId) {
                return { 
                    ...t, 
                    name: trimmedName, 
                    coachName: newTeamCoach.trim() || 'Sin entrenador', 
                    logoUrl: newTeamLogo || t.logoUrl,
                    color: newTeamColor || t.color || '#1e3a8a'
                };
            }
            return t;
        }));
        setEditingTeamId(null);
    } else {
        const newTeamId = `t-${Date.now()}`;
        const newTeam: Team = {
          id: newTeamId,
          name: trimmedName,
          color: newTeamColor || '#1e3a8a',
          coachName: newTeamCoach.trim() || 'Sin entrenador',
          logoUrl: newTeamLogo || '',
          players: Array.from({ length: 12 }, (_, i) => createEmptyPlayer(`${newTeamId}-p${i+1}`, i + 1, getAssignedRole(i)))
        };
        updateTeams(prev => {
            const exists = prev.some(t => t.id === newTeam.id);
            if (exists) return prev.map(t => t.id === newTeam.id ? newTeam : t);
            return [...prev, newTeam];
        });
    }
    setNewTeamName(''); 
    setNewTeamCoach(''); 
    setNewTeamLogo('');
    setNewTeamColor('#1e3a8a');
  };

  const handleEditTeam = (team: Team) => {
    if (!isAdmin) return;
    setEditingTeamId(team.id);
    setNewTeamName(team.name);
    setNewTeamCoach(team.coachName);
    setNewTeamLogo(team.logoUrl || '');
    setNewTeamColor(team.color || '#1e3a8a');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditTeam = () => {
    setEditingTeamId(null);
    setNewTeamName('');
    setNewTeamCoach('');
    setNewTeamLogo('');
    setNewTeamColor('#1e3a8a');
  };

  const handleDeleteTeam = (teamId: string) => {
      if (!isAdmin) return;
      if (!confirm("¿Estás seguro de eliminar este equipo?")) return;
      updateTeams(prev => prev.filter(t => t.id !== teamId));
  };

  const handleSystemReset = async () => {
      if (currentUser?.role !== 'ADMIN') return;
      if (!confirm("⚠️ RESET TOTAL: ¿Borrar todo el sistema?")) return;
      try {
          localStorage.removeItem('vnl_registered_teams');
      } catch (e) {}
      await resetCloudData([DEFAULT_ADMIN]);
      setUsers([DEFAULT_ADMIN]);
      setRegisteredTeams([]);
      setTournaments([]);
      setLiveMatch(null);
      setActiveTournamentId(null);
      setCurrentView('home');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              const rawData = reader.result as string;
              // Compress image to ensure it does not exceed Firestore's 1MB document limit
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
                      const compressed = canvas.toDataURL('image/jpeg', 0.7);
                      setter(compressed);
                  } else {
                      setter(rawData);
                  }
              };
              img.onerror = () => setter(rawData);
              img.src = rawData;
          };
          reader.readAsDataURL(file);
      }
  };

  const handleAddUser = (user: User) => updateUsers([...users, user]);
  const handleDeleteUser = (userId: string) => updateUsers(users.filter(u => u.id !== userId));
  const handleUpdateUser = (updatedUser: User) => { updateUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u)); };

  const handleCreateTournament = async () => {
    try {
        if (!currentUser) return;
        if (selectedTeamIds.length < 2) { alert("Debes seleccionar al menos 2 equipos para el torneo."); return; }
        if (newTourneyData.format === 'KNOCKOUT_4' && selectedTeamIds.length !== 4) {
            alert("Para el formato 'Eliminatoria (4 Equipos)', debes seleccionar exactamente 4 equipos.");
            return;
        }
        
        if (!newTourneyData.name.trim()) { alert("Ingresa un nombre para el torneo"); return; }

        setLoading(true);
        let fixtureData: { groups: any, fixtures: any[] } = { groups: {}, fixtures: [] };
        
        // Filter teams
        const tournamentTeams = registeredTeams.filter(t => selectedTeamIds.includes(t.id));

        try {
            fixtureData = await generateSmartFixture(
                tournamentTeams, 
                newTourneyData.startDate, 
                newTourneyData.endDate,
                newTourneyData.matchDays,
                { format: newTourneyData.format, knockout: newTourneyData.knockout }
            );
        } catch (e) {
            console.error("Smart Fixture Generation Failed, forcing basic fallback", e);
            fixtureData = generateBasicFixture(
                tournamentTeams, 
                newTourneyData.startDate, 
                newTourneyData.endDate, 
                newTourneyData.matchDays,
                { format: newTourneyData.format, knockout: newTourneyData.knockout }
            );
            alert("Aviso: Se generó un fixture básico debido a un problema de conexión con la IA.");
        } finally {
            const { groups, fixtures } = fixtureData;
            
            const newTournament: Tournament = {
              id: `tourney-${Date.now()}`,
              ownerId: currentUser.id, 
              name: newTourneyData.name,
              logoUrl: newTourneyData.logoUrl,
              startDate: newTourneyData.startDate,
              endDate: newTourneyData.endDate,
              teams: tournamentTeams,
              groups,
              fixtures: fixtures.map((f: any, i: number) => ({ ...f, id: `fix-${i}-${Date.now()}`, status: 'scheduled' }))
            };
            updateTournaments([...tournaments, newTournament]);
            setActiveTournamentId(newTournament.id);
            
            setShowCreateTourneyModal(false);
            setCurrentView('dashboard');
            
            setNewTourneyData({
                name: '',
                startDate: new Date().toISOString().split('T')[0],
                endDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
                logoUrl: '',
                matchDays: [],
                format: 'LEAGUE',
                knockout: 'SEMIS'
            });
            setSelectedTeamIds([]);
            setLoading(false);
        }       
    } catch (e) {
        setLoading(false);
        console.error("Fatal error creating tournament:", e);
        alert("Ocurrió un error fatal al crear el torneo. Revisa la consola.");
    }
  };

  const toggleTeamSelection = (teamId: string) => {
      setSelectedTeamIds(prev => {
          if (prev.includes(teamId)) return prev.filter(id => id !== teamId);
          return [...prev, teamId];
      });
  };

  const toggleDaySelection = (day: string) => {
      setNewTourneyData(prev => {
          const exists = prev.matchDays.includes(day);
          return {
              ...prev,
              matchDays: exists ? prev.matchDays.filter(d => d !== day) : [...prev.matchDays, day]
          };
      });
  };

  const handleDeleteTournament = async (id?: string) => {
      const targetId = id || activeTournamentId;
      if (!targetId || currentUser?.role !== 'ADMIN') return;
      if (!confirm("⚠️ ¿Borrar Torneo?")) return;
      const updatedList = tournaments.filter(t => t.id !== targetId);
      if (activeTournamentId === targetId) {
          setActiveTournamentId(null);
          setCurrentView('lobby');
      }
      setTournaments(updatedList);
      await pushData('tournaments', updatedList);
  };

  const updateActiveTournament = (updates: Partial<Tournament>) => {
      if (!activeTournamentId) return;
      updateTournaments(tournaments.map(t => t.id === activeTournamentId ? { ...t, ...updates } : t));
  };

  // --- MATCH CONTROL HANDLERS ---

  const handleInitiateMatch = (fixtureId: string, mode: 'control' | 'preview') => {
      if (liveMatch && liveMatch.matchId === fixtureId) {
          if (mode === 'preview') setTvMode(true);
          setCurrentView('match'); 
          return; 
      }
      if (canControlMatch || currentUser?.role.includes('COACH') || currentUser?.role === 'REFEREE') {
          // Referee enters directly without config modal if match is already live, or waits if not
          if (currentUser.role === 'REFEREE') {
              // If match is not live, referee cannot start it (only ADMIN/COACH starts via config)
              // But for simplicity in this demo, we can let them enter 'match' view which will show "Waiting for start"
              setCurrentView('match');
              return;
          }

          setShowMatchConfigModal(fixtureId);
          setMatchConfigMode(mode);
          setIsEditingRules(false);
          setMatchConfig({ maxSets: 3, pointsPerSet: 25, tieBreakPoints: 15 });
      } else {
          setCurrentView('match');
      }
  };

  const openEditRules = () => {
      if (!liveMatch) return;
      setMatchConfig(liveMatch.config);
      setIsEditingRules(true);
      setShowMatchConfigModal('LIVE_EDIT');
  };

  const handleSaveConfig = () => {
      if (isEditingRules) {
          updateLiveMatch(prev => prev ? {...prev, config: matchConfig} : null);
          setShowMatchConfigModal(null);
          setIsEditingRules(false);
      } else {
          confirmStartMatch();
      }
  };

  const confirmStartMatch = () => {
    if (!activeTournament || !showMatchConfigModal || showMatchConfigModal === 'LIVE_EDIT') return;
    const fixtureId = showMatchConfigModal;

    const fixture = activeTournament.fixtures?.find(f => f.id === fixtureId);
    if (!fixture) return;

    const updatedFixtures = activeTournament.fixtures?.map(f => f.id === fixtureId ? {...f, status: 'live' as const} : f);
    updateActiveTournament({ fixtures: updatedFixtures });

    const teamA = activeTournament.teams?.find(t => t.id === fixture.teamAId);
    const teamB = activeTournament.teams?.find(t => t.id === fixture.teamBId);
    if (!teamA || !teamB) {
        alert("No se pudieron encontrar los equipos del partido seleccionado.");
        return;
    }
    const initialSet: MatchSet = { scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 };
    const rotationA = teamA.players.slice(0, 6);
    const rotationB = teamB.players.slice(0, 6);
    
    updateLiveMatch({
      matchId: fixtureId, 
      config: matchConfig,
      status: 'warmup', // Initialize in Warmup mode
      currentSet: 1, 
      sets: [initialSet],
      rotationA, rotationB, 
      benchA: teamA.players.filter(p => !rotationA.find(r => r.id === p.id)), 
      benchB: teamB.players.filter(p => !rotationB.find(r => r.id === p.id)),
      servingTeamId: teamA.id, 
      scoreA: 0, scoreB: 0, 
      timeoutsA: 0, timeoutsB: 0, 
      substitutionsA: 0, substitutionsB: 0, 
      requests: []
    });
    
    setShowMatchConfigModal(null);
    setCurrentView('match');
    
    if (matchConfigMode === 'preview') {
        setTvMode(true);
    }
  };

  const handleStartGame = () => {
      updateLiveMatch(prev => prev ? { ...prev, status: 'playing' } : null);
  };

  const handleSetServe = (teamId: string) => {
      if (!liveMatch) return;
      updateLiveMatch({ ...liveMatch, servingTeamId: teamId });
  };

  // --- NEW SET MANAGEMENT SYSTEM ---
  
  const handleSetOperation = (action: 'START' | 'FINISH' | 'REOPEN', setIndex: number) => {
      if (!activeTournament || !liveMatch) return;

      updateLiveMatch(prev => {
          if (!prev) return null;
          
          let updatedSets = [...prev.sets];
          let updatedStatus = prev.status;
          let updatedCurrentSet = prev.currentSet;
          let updatedScoreA = prev.scoreA;
          let updatedScoreB = prev.scoreB;
          let updatedServingTeam = prev.servingTeamId;

          while (updatedSets.length <= setIndex) {
              updatedSets.push({ scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 });
          }

          if (action === 'START') {
              updatedCurrentSet = setIndex + 1;
              updatedStatus = 'playing';
              updatedScoreA = updatedSets[setIndex].scoreA;
              updatedScoreB = updatedSets[setIndex].scoreB;

              const fixture = activeTournament.fixtures?.find(f => f.id === prev.matchId);
              if (fixture) {
                  updatedServingTeam = ((setIndex + 1) % 2 !== 0) ? fixture.teamAId : fixture.teamBId;
              }
              
              return {
                  ...prev,
                  status: updatedStatus,
                  currentSet: updatedCurrentSet,
                  scoreA: updatedScoreA,
                  scoreB: updatedScoreB,
                  sets: updatedSets,
                  servingTeamId: updatedServingTeam,
                  timeoutsA: 0,
                  timeoutsB: 0,
                  substitutionsA: 0,
                  substitutionsB: 0
              };
          } 
          
          if (action === 'FINISH') {
             const winsA = updatedSets.filter(s => s.scoreA > s.scoreB).length;
             const winsB = updatedSets.filter(s => s.scoreB > s.scoreA).length;
             const requiredWins = Math.ceil(prev.config.maxSets / 2);

             if (winsA >= requiredWins || winsB >= requiredWins) {
                 return { ...prev, status: 'finished', sets: updatedSets };
             }

             // Auto-increment set number if we are finishing the current set
             if (prev.currentSet === setIndex + 1) {
                 const nextSetNum = prev.currentSet + 1;
                 
                 if (updatedSets.length < nextSetNum) {
                     updatedSets.push({ scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 });
                 }
                 
                 const fixture = activeTournament.fixtures?.find(f => f.id === prev.matchId);
                 // Determine next server: Odd sets Team A, Even sets Team B (simplified rule)
                 const nextServingTeam = fixture ? ((nextSetNum % 2 !== 0) ? fixture.teamAId : fixture.teamBId) : prev.servingTeamId;

                 return {
                     ...prev,
                     status: 'playing', // Set to playing to start next set
                     currentSet: nextSetNum,
                     scoreA: 0,
                     scoreB: 0,
                     sets: updatedSets,
                     servingTeamId: nextServingTeam,
                     timeoutsA: 0,
                     timeoutsB: 0,
                     substitutionsA: 0,
                     substitutionsB: 0
                 };
             }
             return { ...prev, sets: updatedSets };
          }

          if (action === 'REOPEN') {
              updatedCurrentSet = setIndex + 1;
              updatedStatus = 'paused'; 
              updatedScoreA = updatedSets[setIndex].scoreA;
              updatedScoreB = updatedSets[setIndex].scoreB;
              
              return {
                  ...prev,
                  status: updatedStatus,
                  currentSet: updatedCurrentSet,
                  scoreA: updatedScoreA,
                  scoreB: updatedScoreB,
                  sets: updatedSets
              };
          }

          return prev;
      });
  };

  const handleStartNextSet = () => {
      if (!liveMatch) return;
      handleSetOperation('FINISH', liveMatch.currentSet - 1); 
  };

  // ... (ResetMatch, EndBroadcast, etc.)
  const handleResetMatch = (fixtureId: string) => {
      if (!activeTournament || currentUser?.role !== 'ADMIN') return;
      if (!confirm("⚠️ ¿REINICIAR PARTIDO?\n\nSe borrará el resultado y el estado volverá a 'Programado'. Si hay un partido en vivo con este ID, se detendrá.")) return;

      const updatedFixtures = activeTournament.fixtures?.map(f => 
          f.id === fixtureId ? { ...f, status: 'scheduled' as const, winnerId: undefined, resultString: undefined } : f
      );
      updateActiveTournament({ fixtures: updatedFixtures });

      if (liveMatch && liveMatch.matchId === fixtureId) {
          updateLiveMatch(null);
      }
  };

  const handleOpenMvpSelection = () => {
      if (!liveMatch || !activeTournament || !canControlMatch) return;
      if (!confirm("¿Confirmar y Guardar Resultado Final?")) return;
      setShowMvpModal(true);
  };

  const handleConfirmMatchEnd = (mvpPlayerId: string | null) => {
      if (!liveMatch || !activeTournament) return;
      
      const sets = liveMatch.sets || [];
      const winsA = sets.filter(s => s.scoreA > s.scoreB).length;
      const winsB = sets.filter(s => s.scoreB > s.scoreA).length;
      const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId);
      
      let updatedFixtures = activeTournament.fixtures || [];

      if (fixture) {
          const winnerId = winsA > winsB ? fixture.teamAId : (winsB > winsA ? fixture.teamBId : undefined);
          // Update local fixture variable
          updatedFixtures = activeTournament.fixtures?.map(f => f.id === liveMatch.matchId ? { ...f, status: 'finished' as const, winnerId, resultString: `${winsA}-${winsB}` } : f) || [];
      }

      const allHistory = sets.flatMap(s => s.history || []);
      const updatedTeams = registeredTeams.map(team => {
          const updatedPlayers = (team.players || []).map(player => {
              const playerActions = allHistory.filter(h => h.playerId === player.id);
              const points = playerActions.filter(h => h.type === 'attack' || h.type === 'block' || h.type === 'ace').length;
              const aces = playerActions.filter(h => h.type === 'ace').length;
              const blocks = playerActions.filter(h => h.type === 'block').length;
              const yellowCards = playerActions.filter(h => h.type === 'yellow_card').length;
              const redCards = playerActions.filter(h => h.type === 'red_card').length;
              
              const isMvp = player.id === mvpPlayerId;

              if (points > 0 || playerActions.length > 0 || isMvp) {
                  return {
                      ...player,
                      stats: {
                          ...player.stats,
                          matchesPlayed: player.stats.matchesPlayed + 1,
                          points: player.stats.points + points,
                          aces: player.stats.aces + aces,
                          blocks: player.stats.blocks + blocks,
                          mvps: player.stats.mvps + (isMvp ? 1 : 0),
                          yellowCards: (player.stats.yellowCards || 0) + yellowCards,
                          redCards: (player.stats.redCards || 0) + redCards
                      }
                  };
              }
              return player;
          });
          return { ...team, players: updatedPlayers };
      });
      
      // Update global teams pool
      updateTeams(updatedTeams);

      // Perform ATOMIC update to tournament: Fixtures AND Teams (to prevent race conditions)
      updateActiveTournament({ 
          fixtures: updatedFixtures,
          teams: updatedTeams // Important: Sync team stats to the tournament instance as well
      });

      updateLiveMatch(null);
      setTvMode(false);
      setShowMvpModal(false);
      setCurrentView('fixture');
  };

  const rotateTeam = (players: Player[]) => {
    const newRotation = [...players];
    const first = newRotation.shift();
    if (first) newRotation.push(first);
    return newRotation;
  };

  const handlePoint = (teamId: string, type: 'attack' | 'block' | 'ace' | 'opponent_error' | 'yellow_card' | 'red_card', playerId?: string) => {
    if (!liveMatch || !activeTournament) return;
    const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId);
    if (!fixture) return;
    const teamAId = fixture.teamAId;
    const isTeamAScoring = teamId === teamAId;

    updateLiveMatch(prev => {
      if (!prev) return null;
      if (prev.status === 'finished') return prev;

      let newScoreA = prev.scoreA;
      let newScoreB = prev.scoreB;
      let newRotationA = [...prev.rotationA];
      let newRotationB = [...prev.rotationB];
      let newServingTeam = prev.servingTeamId;
      let newStatus = prev.status;

      if (newStatus === 'warmup' || newStatus === 'paused') {
          newStatus = 'playing';
      }

      let pointAwarded = true;

      if (type === 'yellow_card') {
          pointAwarded = false;
      } else if (type === 'red_card') {
          if (teamId === teamAId) {
              newScoreB++;
              if (prev.servingTeamId !== fixture.teamBId) {
                  newRotationB = rotateTeam(prev.rotationB);
                  newServingTeam = fixture.teamBId;
              }
          } else {
              newScoreA++;
              if (prev.servingTeamId !== teamAId) {
                  newRotationA = rotateTeam(prev.rotationA);
                  newServingTeam = teamAId;
              }
          }
          pointAwarded = true; 
      } else {
          if (isTeamAScoring) {
            newScoreA++;
            if (prev.servingTeamId !== teamAId) {
              newRotationA = rotateTeam(prev.rotationA);
              newServingTeam = teamAId;
            }
          } else {
            newScoreB++;
            if (prev.servingTeamId !== fixture.teamBId) {
                newRotationB = rotateTeam(prev.rotationB);
                newServingTeam = fixture.teamBId;
            }
          }
      }

      const isTieBreak = prev.currentSet === prev.config.maxSets;
      const pointsToWin = isTieBreak ? prev.config.tieBreakPoints : prev.config.pointsPerSet;
      
      const setFinished = (newScoreA >= pointsToWin || newScoreB >= pointsToWin) && Math.abs(newScoreA - newScoreB) >= 2;
      
      let finishedSets = [...prev.sets];
      
      const setIndex = prev.currentSet - 1;
      const currentSetData = finishedSets[setIndex] || { scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 };
      const currentHistory = currentSetData.history || [];

      finishedSets[setIndex] = {
          ...currentSetData, 
          scoreA: newScoreA, 
          scoreB: newScoreB,
          history: [...currentHistory, { teamId, playerId, type, scoreSnapshot: `${newScoreA}-${newScoreB}` }]
      };

      if (setFinished && pointAwarded) {
          const winsA = finishedSets.filter(s => s.scoreA > s.scoreB).length;
          const winsB = finishedSets.filter(s => s.scoreB > s.scoreA).length;
          const requiredWins = Math.ceil(prev.config.maxSets / 2);

          if (winsA === requiredWins || winsB === requiredWins) {
               return { 
                   ...prev, 
                   status: 'finished', 
                   scoreA: newScoreA, 
                   scoreB: newScoreB, 
                   sets: finishedSets, 
                   servingTeamId: newServingTeam, 
                   rotationA: newRotationA, 
                   rotationB: newRotationB 
                };
          } else {
            return {
                ...prev, 
                status: 'finished_set', 
                scoreA: newScoreA, 
                scoreB: newScoreB, 
                sets: finishedSets, 
                servingTeamId: newServingTeam, 
                rotationA: newRotationA, 
                rotationB: newRotationB, 
            };
          }
      }
      return { ...prev, status: newStatus, scoreA: newScoreA, scoreB: newScoreB, sets: finishedSets, servingTeamId: newServingTeam, rotationA: newRotationA, rotationB: newRotationB };
    });
  };

  const handleSubtractPoint = (teamId: string) => {
    if (!liveMatch || !activeTournament || !canControlMatch) return;
    const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId);
    if (!fixture) return;
    const isTeamA = teamId === fixture.teamAId;

    updateLiveMatch(prev => {
        if (!prev) return null;
        let newScoreA = prev.scoreA;
        let newScoreB = prev.scoreB;
        
        if (isTeamA && newScoreA > 0) newScoreA--;
        else if (!isTeamA && newScoreB > 0) newScoreB--;
        else return prev; 

        let finishedSets = [...prev.sets];
        const setIndex = prev.currentSet - 1;
        const currentSetData = finishedSets[setIndex] || { scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 };
        const currentHistory = [...(currentSetData.history || [])];

        if (currentHistory.length > 0) {
            currentHistory.pop();
        }

        finishedSets[setIndex] = {
            ...currentSetData, 
            scoreA: newScoreA, 
            scoreB: newScoreB,
            history: currentHistory
        };

        return { ...prev, status: 'playing', scoreA: newScoreA, scoreB: newScoreB, sets: finishedSets };
    });
  };

  const handleRequestTimeout = (teamId: string) => {
    if (!liveMatch) return;
    if (canControlMatch) {
       updateLiveMatch(prev => {
           if (!prev) return null;
           const fixture = activeTournament?.fixtures?.find(f => f.id === prev.matchId);
           const isTeamA = teamId === fixture?.teamAId;
           return { ...prev, timeoutsA: isTeamA ? prev.timeoutsA + 1 : prev.timeoutsA, timeoutsB: !isTeamA ? prev.timeoutsB + 1 : prev.timeoutsB }
       });
       return;
    }
    const newReq: RequestItem = { id: Date.now().toString(), teamId, type: 'timeout', status: 'pending' };
    updateLiveMatch(prev => prev ? { ...prev, requests: [...prev.requests, newReq] } : null);
  };

  const initiateSubRequest = (teamId: string) => {
      setSubPlayerInNum('');
      setSubPlayerOutNum('');
      setShowSubModal({ teamId });
  };

  const handleConfirmSub = () => {
      if (!liveMatch || !showSubModal || !activeTournament) return;
      const { teamId } = showSubModal;
      const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId);
      const isTeamA = teamId === fixture?.teamAId;

      const outNum = parseInt(subPlayerOutNum);
      const inNum = parseInt(subPlayerInNum);

      if (isNaN(outNum) || isNaN(inNum)) return;

      updateLiveMatch(prev => {
          if (!prev) return null;
          
          const currentRotation = isTeamA ? prev.rotationA : prev.rotationB;
          const currentBench = isTeamA ? prev.benchA : prev.benchB;

          const playerOutIndex = currentRotation.findIndex(p => p.number === outNum);
          const playerInIndex = currentBench.findIndex(p => p.number === inNum);

          if (playerOutIndex === -1 || playerInIndex === -1) {
              alert("Jugadores no encontrados en rotación/banca.");
              return prev;
          }

          const playerOut = currentRotation[playerOutIndex];
          const playerIn = currentBench[playerInIndex];

          const newRotation = [...currentRotation];
          newRotation[playerOutIndex] = playerIn;

          const newBench = [...currentBench];
          newBench[playerInIndex] = playerOut;

          return {
              ...prev,
              rotationA: isTeamA ? newRotation : prev.rotationA,
              rotationB: !isTeamA ? newRotation : prev.rotationB,
              benchA: isTeamA ? newBench : prev.benchA,
              benchB: !isTeamA ? newBench : prev.benchB,
              substitutionsA: isTeamA ? prev.substitutionsA + 1 : prev.substitutionsA,
              substitutionsB: !isTeamA ? prev.substitutionsB + 1 : prev.substitutionsB,
          };
      });
      setShowSubModal(null);
  };

  const initiateRotationCheck = (teamId: string) => {
      if (!liveMatch) return;
      // Identify current rotation to pre-fill
      const fixture = activeTournament?.fixtures?.find(f => f.id === liveMatch.matchId);
      const isTeamA = teamId === fixture?.teamAId;
      const currentRot = isTeamA ? liveMatch.rotationA : liveMatch.rotationB;
      
      setRotationInput(currentRot.map(p => p.number.toString()));
      setShowRotationModal({ teamId });
  };

  const handleUpdateRotation = () => {
      if (!liveMatch || !showRotationModal || !activeTournament) return;
      const { teamId } = showRotationModal;
      const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId);
      const isTeamA = teamId === fixture?.teamAId;
      
      const team = activeTournament.teams.find(t => t.id === teamId);
      if (!team) return;

      const newRotation: Player[] = [];
      for (const numStr of rotationInput) {
          const num = parseInt(numStr);
          const p = team.players.find(pl => pl.number === num);
          if (p) newRotation.push(p);
      }

      if (newRotation.length !== 6) {
          alert("Debes especificar 6 jugadores válidos.");
          return;
      }

      // Remaining players go to bench
      const newBench = team.players.filter(p => !newRotation.find(r => r.id === p.id));

      updateLiveMatch(prev => prev ? {
          ...prev,
          rotationA: isTeamA ? newRotation : prev.rotationA,
          rotationB: !isTeamA ? newRotation : prev.rotationB,
          benchA: isTeamA ? newBench : prev.benchA,
          benchB: !isTeamA ? newBench : prev.benchB
      } : null);
      
      setShowRotationModal(null);
  };

  const handleToggleRotationView = () => {
      if (!liveMatch) return;
      const newState = !liveMatch.showRotation;
      const updated = { ...liveMatch, showRotation: newState };
      setLiveMatch(updated);
      pushData('liveMatch', updated);
  };


  // Helper to resolve team or placeholder
  const resolveTeam = (teamId: string, teams: Team[]): Team | { name: string, logoUrl?: string, id: string } | undefined => {
      const realTeam = (teams || []).find(t => t.id === teamId);
      if (realTeam) return realTeam;

      // Placeholder Logic
      if (teamId === 'PLACEHOLDER_SF1_A') return { name: '1º Grupo A', id: teamId, logoUrl: '' };
      if (teamId === 'PLACEHOLDER_SF1_B') return { name: '2º Grupo B', id: teamId, logoUrl: '' };
      if (teamId === 'PLACEHOLDER_SF2_A') return { name: '1º Grupo B', id: teamId, logoUrl: '' };
      if (teamId === 'PLACEHOLDER_SF2_B') return { name: '2º Grupo A', id: teamId, logoUrl: '' };
      if (teamId === 'PLACEHOLDER_FINAL_A') return { name: 'Ganador SF1', id: teamId, logoUrl: '' };
      if (teamId === 'PLACEHOLDER_FINAL_B') return { name: 'Ganador SF2', id: teamId, logoUrl: '' };
      
      // Generic fallback for unknown placeholders
      if (teamId.startsWith('PLACEHOLDER')) return { name: 'TBD', id: teamId, logoUrl: '' };

      return undefined;
  };

  // Edit Tournament Modal State
  const [showEditTourneyModal, setShowEditTourneyModal] = useState(false);
  const [showMvpModal, setShowMvpModal] = useState(false);
  const [editTourneyData, setEditTourneyData] = useState({
      id: '',
      name: '',
      startDate: '',
      endDate: '',
      logoUrl: '',
      matchDays: [] as string[],
      format: 'LEAGUE' as 'LEAGUE' | 'GROUPS',
      knockout: 'SEMIS' as 'SEMIS' | 'FINAL' | 'NONE'
  });

  const handleOpenEditTournament = () => {
      if (!activeTournament) return;
      setEditTourneyData({
          id: activeTournament.id,
          name: activeTournament.name,
          startDate: activeTournament.startDate,
          endDate: activeTournament.endDate,
          logoUrl: activeTournament.logoUrl || '',
          matchDays: [], // We don't store matchDays in Tournament yet, so we reset or need to persist it if we want to edit. For now, reset.
          format: activeTournament.format || 'LEAGUE',
          knockout: activeTournament.knockout || 'SEMIS'
      });
      setShowEditTourneyModal(true);
  };

  const handleUpdateTournament = async () => {
      if (!activeTournament || !editTourneyData.name) return;
      
      const oldFormat = activeTournament.format || 'LEAGUE';
      const oldKnockout = activeTournament.knockout || 'SEMIS';
      
      // Check if critical structure changed (Format or Knockout type)
      const structureChanged = editTourneyData.format !== oldFormat || editTourneyData.knockout !== oldKnockout;
      
      if (structureChanged) {
          const confirmMsg = "⚠️ ATENCIÓN: Has cambiado el FORMATO del torneo. Esto REGENERARÁ EL FIXTURE y se perderán los resultados actuales. ¿Deseas continuar?";
          if (!window.confirm(confirmMsg)) return;
      }

      setLoading(true);

      let newFixtureData = { groups: activeTournament.groups, fixtures: activeTournament.fixtures };
      
      if (structureChanged) {
          try {
            newFixtureData = await generateSmartFixture(
                activeTournament.teams,
                editTourneyData.startDate,
                editTourneyData.endDate,
                editTourneyData.matchDays,
                { format: editTourneyData.format, knockout: editTourneyData.knockout }
            );
          } catch (e) {
             console.error("Failed to regenerate fixture", e);
             newFixtureData = generateBasicFixture(
                activeTournament.teams,
                editTourneyData.startDate,
                editTourneyData.endDate,
                editTourneyData.matchDays,
                { format: editTourneyData.format, knockout: editTourneyData.knockout }
             );
          }
      }

      const updatedTournament: Tournament = {
          ...activeTournament,
          name: editTourneyData.name,
          startDate: editTourneyData.startDate,
          endDate: editTourneyData.endDate,
          logoUrl: editTourneyData.logoUrl,
          format: editTourneyData.format,
          knockout: editTourneyData.knockout,
          // Only update groups/fixtures if structure changed, otherwise keep existing
          groups: structureChanged ? newFixtureData.groups : activeTournament.groups,
          fixtures: structureChanged ? newFixtureData.fixtures.map((f, i) => ({
              ...f,
              id: `${activeTournament.id}_fix_${Date.now()}_${i}`,
              status: 'scheduled'
          })) : activeTournament.fixtures
      };

      const updatedList = tournaments.map(t => t.id === updatedTournament.id ? updatedTournament : t);
      setTournaments(updatedList);
      setActiveTournamentId(updatedTournament.id); // Refresh active
      pushData('tournaments', updatedList);
      
      setShowEditTourneyModal(false);
      setLoading(false);
  };

  // --- RENDER HELPERS ---

  if (isTransmitterMode) {
      return (
          <VARTransmitter 
            onExit={() => setIsTransmitterMode(false)}
          />
      );
  }

  if (!currentUser) {
      return (
          <Login 
            onLogin={(u) => { 
                setCurrentUser(u); 
                // Fix: Always attempt to init cloud if config exists
                // This allows Viewers to see live data immediately
                const saved = loadConfig();
                if (saved?.config) {
                    initCloud(saved.config, saved.organizationId || '');
                }
            }}
            users={users}
            isCloudConnected={isCloudConnected}
            onOpenCloudConfig={() => setShowCloudConfig(true)}
            onEnterTransmitter={() => setIsTransmitterMode(true)}
          />
      );
  }

  // --- NEW: Render TV Overlay directly (Full Screen, No Layout) if in TV Mode ---
  if (tvMode && liveMatch && activeTournament) {
      return (
        <>
          <TVOverlay 
            match={liveMatch}
            teamA={activeTournament.teams.find(t => t.id === activeTournament?.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId) || { id: 'A', name: 'Equipo A', players: [], coachName: '', color: '#ef4444' }}
            teamB={activeTournament.teams.find(t => t.id === activeTournament?.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId) || { id: 'B', name: 'Equipo B', players: [], coachName: '', color: '#3b82f6' }}
            swapSides={swapSides}
            tournament={activeTournament}
            currentUser={currentUser}
            onExit={() => setTvMode(false)}
            onLogout={currentUser.role === 'VIEWER' ? () => { setCurrentUser(null); setLiveMatch(null); setCurrentView('home'); } : undefined}
            onBack={currentUser.role === 'VIEWER' ? () => { setCurrentView('dashboard'); setTvMode(false); } : undefined}
            onNextSet={handleStartNextSet}
            nextSetCountdown={nextSetCountdown}
            // PASS CLOUD STATE TO OVERLAY
            showStatsOverlay={liveMatch.showStats}
            showScoreboard={liveMatch.showScoreboard}
            isCloudConnected={isCloudConnected}
            onUpdateMatch={(updates: Partial<LiveMatchState>) => {
                if (!liveMatch) return;
                const updatedMatch = { ...liveMatch, ...updates };
                setLiveMatch(updatedMatch);
                pushData('liveMatch', updatedMatch);
            }}
            // Control Handlers
            onPoint={handlePoint}
            onSubtractPoint={handleSubtractPoint}
            onRequestTimeout={handleRequestTimeout}
            onRequestSub={initiateSubRequest}
            onModifyRotation={initiateRotationCheck}
            onSetServe={handleSetServe}
          />
          
          {/* Substitution Modal (TV Mode) */}
          {showSubModal && liveMatch && activeTournament && (
              <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
                  <div className="bg-vnl-panel border border-white/20 p-6 w-full max-w-sm shadow-2xl">
                      <h3 className="text-lg font-black text-white uppercase italic tracking-tighter mb-4 text-center">Realizar Cambio</h3>
                      <div className="flex items-center justify-center gap-4 mb-6">
                           <div className="text-center">
                               <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Sale (#)</label>
                               <input 
                                 type="number" 
                                 value={subPlayerOutNum} 
                                 onChange={e => setSubPlayerOutNum(e.target.value)} 
                                 className="w-16 h-16 bg-red-900/20 border border-red-500/50 text-white font-black text-2xl text-center rounded focus:outline-none focus:border-red-500"
                                 placeholder="OUT"
                               />
                           </div>
                           <span className="text-2xl text-slate-500">→</span>
                           <div className="text-center">
                               <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Entra (#)</label>
                               <input 
                                 type="number" 
                                 value={subPlayerInNum} 
                                 onChange={e => setSubPlayerInNum(e.target.value)} 
                                 className="w-16 h-16 bg-green-900/20 border border-green-500/50 text-white font-black text-2xl text-center rounded focus:outline-none focus:border-green-500"
                                 placeholder="IN"
                               />
                           </div>
                      </div>
                      <div className="flex gap-2">
                          <button onClick={() => setShowSubModal(null)} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 rounded text-xs font-bold uppercase">Cancelar</button>
                          <button onClick={handleConfirmSub} className="flex-1 bg-vnl-accent hover:bg-cyan-400 text-black py-3 rounded text-xs font-black uppercase shadow-[0_0_15px_rgba(6,182,212,0.3)]">Confirmar</button>
                      </div>
                  </div>
              </div>
          )}
          </>
      );
  }
  
  // Render Main App (Standard Layout)
  return (
    <Layout 
      currentUser={currentUser} 
      onLogout={() => { setCurrentUser(null); setLiveMatch(null); setCurrentView('home'); }} 
      onNavigate={setCurrentView}
      currentView={currentView}
      isCloudConnected={isCloudConnected}
      onOpenCloudConfig={() => setShowCloudConfig(true)}
    >
      {/* CLOUD CONFIG MODAL */}
      {showCloudConfig && (
          <CloudConfig 
            onClose={() => setShowCloudConfig(false)}
            onConnected={() => setIsCloudConnected(true)}
            currentUser={currentUser}
          />
      )}

      {/* VIEWS */}
      
      {/* 1. HOME VIEW */}
      {currentView === 'home' && (
         <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
             <div className="relative">
                 <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-vnl-accent opacity-20 blur-xl rounded-full"></div>
                 <h1 className="relative text-5xl md:text-7xl font-black text-white italic tracking-tighter">
                     JSPORT <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">MANAGER</span>
                 </h1>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                 <button onClick={() => setCurrentView('lobby')} className="bg-corp-panel hover:bg-white/5 border border-white/10 p-6 rounded-xl group transition duration-300">
                     <span className="text-4xl mb-2 block group-hover:scale-110 transition">🏆</span>
                     <h3 className="text-xl font-bold text-white uppercase italic">Torneos</h3>
                     <p className="text-sm text-slate-500 mt-1">Gestionar campeonatos y fixtures</p>
                 </button>
                 <button onClick={() => setCurrentView('teams')} className="bg-corp-panel hover:bg-white/5 border border-white/10 p-6 rounded-xl group transition duration-300">
                     <span className="text-4xl mb-2 block group-hover:scale-110 transition">👥</span>
                     <h3 className="text-xl font-bold text-white uppercase italic">Equipos</h3>
                     <p className="text-sm text-slate-500 mt-1">Administrar plantillas y jugadores</p>
                 </button>
                 {isAdmin && (
                    <button onClick={() => setCurrentView('users')} className="bg-corp-panel hover:bg-white/5 border border-white/10 p-6 rounded-xl group transition duration-300 md:col-span-2">
                        <span className="text-4xl mb-2 block group-hover:scale-110 transition">⚙️</span>
                        <h3 className="text-xl font-bold text-white uppercase italic">Administración</h3>
                        <p className="text-sm text-slate-500 mt-1">Usuarios y Configuración del Sistema</p>
                    </button>
                 )}
             </div>
         </div>
      )}

      {/* 2. LOBBY VIEW (Tournaments List) */}
      {currentView === 'lobby' && (
          <div className="space-y-6 animate-in slide-in-from-right-4">
              <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Torneos <span className="text-vnl-accent">Activos</span></h2>
                  {isAdmin && (
                      <button onClick={() => setShowCreateTourneyModal(true)} className="bg-vnl-accent hover:bg-cyan-400 text-black font-black px-6 py-3 rounded shadow-[0_0_15px_rgba(6,182,212,0.3)] transition uppercase text-xs tracking-widest">
                          + Nuevo Torneo
                      </button>
                  )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tournaments.map(t => (
                      <div key={t.id} className="relative group">
                          <div onClick={() => { setActiveTournamentId(t.id); setCurrentView('dashboard'); }} className="bg-corp-panel border border-white/10 rounded-xl overflow-hidden hover:border-vnl-accent/50 transition cursor-pointer h-full">
                              <div className="h-32 bg-gradient-to-br from-blue-900/40 to-black relative flex items-center justify-center p-4">
                                  {t.logoUrl ? <img src={t.logoUrl} className="h-full w-full object-contain drop-shadow-lg group-hover:scale-110 transition duration-500" /> : <span className="text-6xl group-hover:scale-110 transition duration-500">🏆</span>}
                              </div>
                              <div className="p-4">
                                  <h3 className="text-xl font-black text-white uppercase italic tracking-tight">{t.name}</h3>
                                  <p className="text-xs text-slate-400 font-bold uppercase mt-1">{t.teams.length} Equipos • {t.fixtures?.length || 0} Partidos</p>
                                  <div className="mt-4 flex justify-between items-center">
                                      <span className="text-[10px] bg-white/10 px-2 py-1 rounded text-slate-300">{new Date(t.startDate).toLocaleDateString()}</span>
                                      <span className="text-vnl-accent text-xs font-bold uppercase tracking-widest group-hover:translate-x-1 transition">Ver Panel →</span>
                                  </div>
                              </div>
                          </div>
                          {isAdmin && (
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteTournament(t.id); }} className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-10 shadow-lg" title="Eliminar torneo">
                                  🗑️
                              </button>
                          )}
                      </div>
                  ))}
                  {tournaments.length === 0 && (
                      <div className="col-span-full py-20 text-center text-slate-600 font-bold uppercase tracking-widest">No hay torneos creados</div>
                  )}
              </div>
          </div>
      )}

      {/* 3. DASHBOARD VIEW (Single Tournament) */}
      {currentView === 'dashboard' && activeTournament && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
               {/* Tournament Header */}
               <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-4 gap-4">
                   <div className="flex items-center gap-4">
                       <button onClick={() => setCurrentView('lobby')} className="text-slate-500 hover:text-white transition">← Volver</button>
                       {activeTournament.logoUrl && <img src={activeTournament.logoUrl} className="w-16 h-16 object-contain" />}
                       <div>
                           <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">{activeTournament.name}</h1>
                           <div className="flex gap-4 mt-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                               <span>📅 {new Date(activeTournament.startDate).toLocaleDateString()}</span>
                               <span>👥 {activeTournament.teams.length} Teams</span>
                           </div>
                       </div>
                   </div>
                   
                   <div className="flex gap-2">
                       <button onClick={() => setCurrentView('fixture')} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition">Fixture</button>
                       <button onClick={() => setCurrentView('standings')} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition">Tabla</button>
                       <button onClick={() => setCurrentView('stats')} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition">Estadísticas</button>
                       {isAdmin && (
                           <>
                               <button onClick={handleOpenEditTournament} className="bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 border border-blue-500/30 px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition">Editar</button>
                               <button onClick={() => handleDeleteTournament()} className="bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-500/30 px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition">Eliminar</button>
                           </>
                       )}
                   </div>
               </div>

               {/* Fixture / Matches List */}
               <div className="grid gap-4">
                   {activeTournament.fixtures?.map((fix) => {
                       const teamA = resolveTeam(fix.teamAId, activeTournament.teams);
                       const teamB = resolveTeam(fix.teamBId, activeTournament.teams);
                       if (!teamA || !teamB) return null;

                       const isLive = fix.status === 'live';
                       const isFinished = fix.status === 'finished';
                       const isPlaceholder = fix.teamAId.startsWith('PLACEHOLDER') || fix.teamBId.startsWith('PLACEHOLDER');

                       return (
                           <div key={fix.id} className={`bg-corp-panel border ${isLive ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'border-white/10'} rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4 group transition hover:bg-white/5`}>
                               <div className="flex items-center gap-4 w-full md:w-1/3">
                                   <div className="text-center w-12 shrink-0">
                                       <div className="text-xs font-bold text-slate-500 uppercase">{new Date(fix.date).getDate()}</div>
                                       <div className="text-[10px] font-black text-slate-600 uppercase">{new Date(fix.date).toLocaleString('es-ES', { month: 'short' })}</div>
                                   </div>
                                   <div className="flex flex-col">
                                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{fix.group}</span>
                                       <div className="flex items-center gap-2">
                                           {isLive && <span className="bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase animate-pulse">EN VIVO</span>}
                                           {isFinished && <span className="bg-slate-700 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase">FINAL</span>}
                                       </div>
                                   </div>
                               </div>

                               <div className="flex items-center justify-center gap-4 w-full md:w-1/3">
                                   <div className={`flex items-center gap-2 ${fix.winnerId === teamA.id ? 'text-yellow-400' : 'text-white'}`}>
                                       <span className="font-bold uppercase text-sm md:text-base text-right">{teamA.name}</span>
                                       {teamA.logoUrl && <img src={teamA.logoUrl} className="w-8 h-8 object-contain" />}
                                   </div>
                                   <div className="bg-black/40 px-3 py-1 rounded text-xl font-black text-white font-mono tracking-widest">
                                       {isFinished ? fix.resultString : isLive ? 'VS' : '-'}
                                   </div>
                                   <div className={`flex items-center gap-2 ${fix.winnerId === teamB.id ? 'text-yellow-400' : 'text-white'}`}>
                                       {teamB.logoUrl && <img src={teamB.logoUrl} className="w-8 h-8 object-contain" />}
                                       <span className="font-bold uppercase text-sm md:text-base">{teamB.name}</span>
                                   </div>
                               </div>

                                <div className="w-full md:w-1/3 flex justify-end gap-2">
                                   {canControlMatch && (
                                       <>
                                         {isLive ? (
                                             <button onClick={() => handleInitiateMatch(fix.id, 'control')} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-xs font-black uppercase tracking-widest shadow-lg transition animate-pulse">
                                                 Continuar
                                             </button>
                                         ) : isFinished ? (
                                              <button onClick={() => handleResetMatch(fix.id)} className="text-xs font-bold text-slate-500 hover:text-red-400 uppercase tracking-wider px-3 py-2 border border-transparent hover:border-red-500/30 rounded transition">
                                                 Reiniciar
                                              </button>
                                         ) : (
                                              <button 
                                                onClick={() => handleInitiateMatch(fix.id, 'control')} 
                                                disabled={isPlaceholder}
                                                className={`px-4 py-2 rounded text-xs font-black uppercase tracking-widest shadow transition ${isPlaceholder ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-vnl-accent hover:bg-cyan-400 text-black'}`}
                                                title={isPlaceholder ? "Esperando clasificación de equipos" : "Iniciar Partido"}
                                              >
                                                  {isPlaceholder ? 'Por Definir' : 'Iniciar'}
                                              </button>
                                         )}
                                       </>
                                   )}
                                   
                                   {/* Referee Specific Button */}
                                   {currentUser?.role === 'REFEREE' && (isLive || isFinished) && (
                                       <button 
                                            onClick={() => {
                                                if (!liveMatch || liveMatch.matchId !== fix.id) {
                                                    handleInitiateMatch(fix.id, 'control');
                                                } else {
                                                    setCurrentView('match'); 
                                                    setTvMode(false);
                                                }
                                            }}
                                            className="bg-yellow-600 hover:bg-yellow-500 text-black px-4 py-2 rounded text-xs font-black uppercase tracking-widest shadow-lg transition flex items-center gap-2"
                                       >
                                           <span>⚖️</span> Ver Rotación
                                       </button>
                                   )}

                                   {/* Viewers/Others can watch live */}
                                   {(isLive || isFinished) && !canControlMatch && currentUser?.role !== 'REFEREE' && (
                                        <button onClick={() => { setLiveMatch(liveMatch); setCurrentView('match'); setTvMode(true); }} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded text-xs font-black uppercase tracking-widest border border-white/10 transition">
                                            {isLive ? '🔴 Ver en Vivo' : 'Ver Resultado'}
                                        </button>
                                   )}
                               </div>
                           </div>
                       );
                   })}
               </div>
          </div>
      )}

      {/* MATCH VIEW - CONTROL PANEL */}
      {currentView === 'match' && liveMatch && activeTournament && (
          <div className="relative min-h-[85vh]">
                <div className="space-y-4 pb-20">
                     {/* Control Bar */}
                     <div className="flex justify-between items-center bg-slate-900/90 p-4 border-b border-white/10 rounded-t-xl backdrop-blur-md sticky top-16 z-30 shadow-lg">
                         <div className="flex items-center gap-4">
                             <button onClick={() => setCurrentView('dashboard')} className="text-slate-400 hover:text-white font-bold text-xs uppercase tracking-widest">← Panel</button>
                             <div className="h-6 w-px bg-white/10"></div>
                             <span className="text-white font-bold uppercase tracking-tight text-lg">{activeTournament.name}</span>
                             <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${liveMatch.status === 'playing' ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-700 text-slate-300'}`}>
                                 {liveMatch.status === 'warmup' ? 'Calentamiento' : liveMatch.status === 'finished_set' ? 'Set Finalizado' : liveMatch.status === 'finished' ? 'Partido Finalizado' : 'En Vivo'}
                             </span>
                         </div>
                         <div className="flex gap-2 flex-wrap justify-end">
                             <button onClick={toggleFullScreen} className="bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest border border-white/10 focus:ring-2 focus:ring-vnl-accent/50 outline-none hidden md:block">Pantalla Completa</button>
                             <button onClick={() => setSwapSides(!swapSides)} className="bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest border border-white/10 focus:ring-2 focus:ring-vnl-accent/50 outline-none">Cambiar Lado</button>
                             {canControlMatch && (
                                 <>
                                    <button onClick={() => setTvMode(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest shadow focus:ring-2 focus:ring-blue-400 outline-none">Vista TV 📺</button>
                                    <button onClick={openEditRules} className="bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest border border-white/10 focus:ring-2 focus:ring-vnl-accent/50 outline-none">Reglas</button>
                                    {liveMatch.status === 'playing' && <button onClick={() => {if(confirm('¿Terminar Set actual manualmente?')) handleSetOperation('FINISH', liveMatch.currentSet - 1)}} className="bg-orange-900/20 hover:bg-orange-900/40 text-orange-400 border border-orange-500/20 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest focus:ring-2 focus:ring-orange-500 outline-none">Terminar Set</button>}
                                    <button onClick={handleOpenMvpSelection} className="bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-500/20 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest focus:ring-2 focus:ring-red-500 outline-none">Terminar Partido</button>
                                 </>
                             )}
                             {currentUser.role === 'REFEREE' && (
                                 <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 px-3 py-1 rounded text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                     <span>⚖️</span> Modo Árbitro de Piso
                                 </div>
                             )}
                         </div>
                     </div>
                     
                     {/* Game Area */}
                     <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6">
                        
                        {/* 1. Scoreboard (Top on Mobile, Center Top on Desktop via Flex Column) */}
                        <div className="order-1 lg:col-span-6 lg:order-2 flex flex-col gap-4">
                            {/* Scoreboard Display */}
                            <div className={`bg-black/60 rounded-xl border border-white/10 p-4 flex justify-between items-center shadow-2xl relative overflow-hidden ${swapSides ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`text-4xl lg:text-6xl font-black text-white tabular-nums w-1/3 ${swapSides ? 'text-right' : 'text-left'}`}>{liveMatch.scoreA}</div>
                                <div className="flex flex-col items-center z-10 w-1/3">
                                    <div className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest text-center truncate w-full">Set {liveMatch.currentSet}</div>
                                    <div className="text-xl md:text-2xl font-black text-white italic">VS</div>
                                    {liveMatch.status === 'finished_set' && (
                                        <button onClick={handleStartNextSet} className="mt-2 bg-green-600 hover:bg-green-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase animate-pulse shadow-lg whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-green-400">
                                            Siguiente Set
                                        </button>
                                    )}
                                    {liveMatch.status === 'warmup' && isAdmin && (
                                        <button onClick={handleStartGame} className="mt-2 bg-green-600 hover:bg-green-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase animate-pulse shadow-lg whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-green-400">
                                            Iniciar Partido
                                        </button>
                                    )}
                                </div>
                                <div className={`text-4xl lg:text-6xl font-black text-white tabular-nums w-1/3 ${swapSides ? 'text-left' : 'text-right'}`}>{liveMatch.scoreB}</div>
                            </div>
                            
                            {/* TV Transmission Controls (Center Panel) */}
                            {canControlMatch && (
                                <div className="bg-black/40 rounded-xl border border-white/10 p-4 shadow-xl">
                                    <h4 className="text-sm font-black text-white uppercase italic tracking-widest border-b border-white/10 pb-2 mb-4 text-center">Controles de Transmisión</h4>
                                    
                                    <div className="flex w-full justify-between items-center bg-black/30 rounded p-2 mb-2 border border-white/5">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Marcador TV</span>
                                        <button 
                                            onClick={() => updateLiveMatch(prev => prev ? {...prev, showScoreboard: !prev.showScoreboard} : null)} 
                                            className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-widest transition ${liveMatch.showScoreboard ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                                        >
                                            {liveMatch.showScoreboard ? 'Visible' : 'Oculto'}
                                        </button>
                                    </div>

                                    <div className="flex w-full justify-between items-center bg-black/30 rounded p-2 mb-2 border border-white/5">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Rotación</span>
                                        <button 
                                            onClick={() => updateLiveMatch(prev => prev ? {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), showFormations: !(prev.tvSettings?.showFormations)}} : null)} 
                                            className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-widest transition ${liveMatch.tvSettings?.showFormations ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                                        >
                                            {liveMatch.tvSettings?.showFormations ? 'Activo' : 'Inactivo'}
                                        </button>
                                    </div>

                                    <div className="flex flex-col w-full justify-center items-center bg-black/30 rounded p-2 mb-4 border border-white/5">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center gap-2 w-full mb-2">
                                            Stats & Gráficos
                                        </span>
                                        <div className="flex gap-1 justify-center flex-wrap w-full">
                                            <button 
                                                onClick={() => updateLiveMatch(prev => prev ? {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), showSetStatsExt: !(prev.tvSettings?.showSetStatsExt)}} : null)} 
                                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition ${liveMatch.tvSettings?.showSetStatsExt ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                                            >
                                                Stats Set (%)
                                            </button>
                                            <button 
                                                onClick={() => updateLiveMatch(prev => prev ? {...prev, showStats: !(prev.showStats && prev.statsSetIndex === undefined), statsSetIndex: undefined} : null)} 
                                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition ${liveMatch.showStats && liveMatch.statsSetIndex === undefined ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                                            >
                                                Stats General
                                            </button>
                                            <button 
                                                onClick={() => updateLiveMatch(prev => prev ? {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), showPointEvolution: !(prev.tvSettings?.showPointEvolution)}} : null)} 
                                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition ${liveMatch.tvSettings?.showPointEvolution ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                                            >
                                                Evol. Puntos
                                            </button>
                                            <button 
                                                onClick={() => updateLiveMatch(prev => prev ? {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), showWinPrediction: !(prev.tvSettings?.showWinPrediction)}} : null)} 
                                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition ${liveMatch.tvSettings?.showWinPrediction ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                                            >
                                                Predicción Set
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    updateLiveMatch(prev => {
                                                        if (!prev) return null;
                                                        const fix = activeTournament.fixtures?.find(f => f.id === prev.matchId);
                                                        const teamAId = fix?.teamAId || '';
                                                        const isA = prev.tvSettings?.showTeamStats === teamAId;
                                                        return {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), showTeamStats: isA ? false : teamAId}};
                                                    });
                                                }} 
                                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition ${liveMatch.tvSettings?.showTeamStats === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                                            >
                                                Eq. A
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    updateLiveMatch(prev => {
                                                        if (!prev) return null;
                                                        const fix = activeTournament.fixtures?.find(f => f.id === prev.matchId);
                                                        const teamBId = fix?.teamBId || '';
                                                        const isB = prev.tvSettings?.showTeamStats === teamBId;
                                                        return {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), showTeamStats: isB ? false : teamBId}};
                                                    });
                                                }} 
                                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition ${liveMatch.tvSettings?.showTeamStats === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                                            >
                                                Eq. B
                                            </button>
                                            <button 
                                                onClick={() => updateLiveMatch(prev => prev ? {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), showServeSpeed: !(prev.tvSettings?.showServeSpeed)}} : null)} 
                                                className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition ${liveMatch.tvSettings?.showServeSpeed ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                                            >
                                                Saque
                                            </button>
                                        </div>
                                    </div>

                                    <div className="border border-white/10 rounded overflow-hidden">
                                        <div className="bg-white/5 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                            Hawk-Eye Challenge
                                        </div>
                                        <div className="flex gap-2 p-2">
                                            <button 
                                                onClick={() => updateLiveMatch(prev => prev ? {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), hawkEyeStatus: prev.tvSettings?.hawkEyeStatus === 'in' ? null : 'in'}} : null)} 
                                                className={`flex-1 py-2 rounded text-xs font-black uppercase transition ${liveMatch.tvSettings?.hawkEyeStatus === 'in' ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-green-900/30 text-green-500 border border-green-500/30'}`}
                                            >
                                                IN (Dentro)
                                            </button>
                                            <button 
                                                onClick={() => updateLiveMatch(prev => prev ? {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), hawkEyeStatus: prev.tvSettings?.hawkEyeStatus === 'out' ? null : 'out'}} : null)} 
                                                className={`flex-1 py-2 rounded text-xs font-black uppercase transition ${liveMatch.tvSettings?.hawkEyeStatus === 'out' ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-red-900/30 text-red-500 border border-red-500/30'}`}
                                            >
                                                OUT (Fuera)
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-4 border border-white/10 rounded overflow-hidden">
                                        <div className="bg-white/5 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                                            Destacar Jugador (TV)
                                        </div>
                                        <div className="flex flex-col gap-2 p-2">
                                            <div className="flex gap-2">
                                                <select
                                                    value={statsPanelTeam}
                                                    onChange={e => {
                                                        setStatsPanelTeam(e.target.value);
                                                        setStatsPanelPlayerId('');
                                                    }}
                                                    className="flex-1 p-2 bg-black/40 border border-white/10 text-white text-xs font-bold focus:border-vnl-accent outline-none uppercase"
                                                >
                                                    <option value="team_a">Local (A)</option>
                                                    <option value="team_b">Visita (B)</option>
                                                </select>
                                                <select
                                                    value={statsPanelPlayerId}
                                                    onChange={e => setStatsPanelPlayerId(e.target.value)}
                                                    className="flex-1 p-2 bg-black/40 border border-white/10 text-white text-xs font-bold focus:border-vnl-accent outline-none uppercase"
                                                >
                                                    <option value="">-- Jugador --</option>
                                                    {(statsPanelTeam === 'team_a' ? [...liveMatch.rotationA, ...liveMatch.benchA] : [...liveMatch.rotationB, ...liveMatch.benchB]).sort((p1, p2) => p1.number - p2.number).map(p => (
                                                        <option key={p.id} value={p.id}>#{p.number} {p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex gap-2 mt-1">
                                                <button
                                                    onClick={() => updateLiveMatch(prev => prev ? {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), featuredPlayerId: statsPanelPlayerId, featuredPlayerMode: prev.tvSettings?.featuredPlayerMode === 'presentation' ? null : 'presentation'}} : null)}
                                                    disabled={!statsPanelPlayerId}
                                                    className={`flex-1 py-2 rounded text-[10px] font-black uppercase transition disabled:opacity-50 ${liveMatch.tvSettings?.featuredPlayerMode === 'presentation' ? 'bg-vnl-accent text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-slate-800 text-cyan-400 hover:bg-slate-700'}`}
                                                >
                                                    Lanzar Foto
                                                </button>
                                                <button
                                                    onClick={() => updateLiveMatch(prev => prev ? {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), featuredPlayerId: statsPanelPlayerId, featuredPlayerMode: prev.tvSettings?.featuredPlayerMode === 'stats' ? null : 'stats'}} : null)}
                                                    disabled={!statsPanelPlayerId}
                                                    className={`flex-1 py-2 rounded text-[10px] font-black uppercase transition disabled:opacity-50 ${liveMatch.tvSettings?.featuredPlayerMode === 'stats' ? 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.5)]' : 'bg-slate-800 text-orange-400 hover:bg-slate-700'}`}
                                                >
                                                    Al Marcador
                                                </button>
                                                <div className="flex-1 relative">
                                                    <select
                                                        value={liveMatch.tvSettings?.showVersus ? (typeof liveMatch.tvSettings.showVersus === 'string' ? liveMatch.tvSettings.showVersus : 'auto') : ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            updateLiveMatch(prev => prev ? {...prev, tvSettings: {...(prev.tvSettings || {style:'horizontal'}), showVersus: val === '' ? false : (val === 'auto' ? true : val)}} : null);
                                                        }}
                                                        className={`w-full py-2 px-1 rounded text-[10px] font-black uppercase transition appearance-none text-center cursor-pointer ${liveMatch.tvSettings?.showVersus ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.5)]' : 'bg-slate-800 text-purple-400 hover:bg-slate-700'}`}
                                                    >
                                                        <option value="">Off Versus</option>
                                                        <option value="auto">Vs Auto (Jugador)</option>
                                                        <option value="Punta">Vs Puntas</option>
                                                        <option value="Opuesto">Vs Opuestos</option>
                                                        <option value="Central">Vs Centrales</option>
                                                        <option value="Libero">Vs Líberos</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {/* Courts - Desktop Only here, hidden on mobile */}
                            <div className={`hidden lg:flex ${isVertical ? 'flex-row' : 'flex-col'} gap-1`}>
                                <Court 
                                    players={liveMatch.rotationA} 
                                    serving={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId}
                                    teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId)?.name!}
                                    variant={(currentUser.role === 'REFEREE' || currentUser.role === 'MAIN_REFEREE') ? 'referee' : 'default'}
                                    isVertical={isVertical}
                                />
                                <div className={`${isVertical ? 'w-1 h-full' : 'h-1 w-full'} bg-white/20 rounded-full`}></div>
                                <Court 
                                    players={liveMatch.rotationB} 
                                    serving={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId}
                                    teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId)?.name!}
                                    variant={(currentUser.role === 'REFEREE' || currentUser.role === 'MAIN_REFEREE') ? 'referee' : 'default'}
                                    isVertical={isVertical}
                                />
                            </div>
                        </div>

                        {/* 2. Team A Control (Middle Left on Desktop) */}
                        <div className={`order-2 lg:col-span-3 ${swapSides ? 'lg:order-3' : 'lg:order-1'} space-y-4`}>
                            <ScoreControl 
                                role={currentUser.role}
                                linkedTeamId={currentUser.linkedTeamId}
                                onPoint={handlePoint}
                                onSubtractPoint={handleSubtractPoint}
                                onRequestTimeout={handleRequestTimeout}
                                onRequestSub={initiateSubRequest}
                                onModifyRotation={initiateRotationCheck}
                                onSetServe={handleSetServe}
                                onToggleRotationView={handleToggleRotationView}
                                showRotationView={liveMatch.showRotation}
                                teamId={activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId!}
                                teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId)?.name!}
                                players={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId)?.players || []}
                                disabled={liveMatch.status === 'finished'}
                                timeoutsUsed={liveMatch.timeoutsA}
                                subsUsed={liveMatch.substitutionsA}
                                isServing={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId}
                            />
                             {/* Bench A */}
                             <div className="bg-black/20 p-3 rounded border border-white/5">
                                 <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Banca</h4>
                                 <div className="flex flex-wrap gap-2">
                                     {liveMatch.benchA.map(p => (
                                         <span key={p.id} className="bg-white/5 text-slate-300 text-xs px-2 py-1 rounded font-bold">#{p.number}</span>
                                     ))}
                                 </div>
                             </div>
                        </div>
                        
                        {/* 3. Team B Control (Middle Right on Desktop) */}
                        <div className={`order-3 lg:col-span-3 ${swapSides ? 'lg:order-1' : 'lg:order-3'} space-y-4`}>
                            <ScoreControl 
                                role={currentUser.role}
                                linkedTeamId={currentUser.linkedTeamId}
                                onPoint={handlePoint}
                                onSubtractPoint={handleSubtractPoint}
                                onRequestTimeout={handleRequestTimeout}
                                onRequestSub={initiateSubRequest}
                                onModifyRotation={initiateRotationCheck}
                                onSetServe={handleSetServe}
                                teamId={activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId!}
                                teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId)?.name!}
                                players={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId)?.players || []}
                                disabled={liveMatch.status === 'finished'}
                                timeoutsUsed={liveMatch.timeoutsB}
                                subsUsed={liveMatch.substitutionsB}
                                isServing={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId}
                            />
                             {/* Bench B */}
                             <div className="bg-black/20 p-3 rounded border border-white/5">
                                 <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Banca</h4>
                                 <div className="flex flex-wrap gap-2">
                                     {liveMatch.benchB.map(p => (
                                         <span key={p.id} className="bg-white/5 text-slate-300 text-xs px-2 py-1 rounded font-bold">#{p.number}</span>
                                     ))}
                                 </div>
                             </div>
                        </div>

                        {/* 4. Action Log and Courts - Mobile Only here */}
                        <div className="order-4 lg:hidden flex flex-col gap-4">
                            {/* Courts */}
                            <div className="flex flex-col gap-1">
                                <Court 
                                    players={liveMatch.rotationA} 
                                    serving={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId}
                                    teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId)?.name!}
                                    variant={(currentUser.role === 'REFEREE' || currentUser.role === 'MAIN_REFEREE') ? 'referee' : 'default'}
                                    isVertical={isVertical}
                                />
                                <div className={`${isVertical ? 'w-1 h-full' : 'h-1 w-full'} bg-white/20 rounded-full`}></div>
                                <Court 
                                    players={liveMatch.rotationB} 
                                    serving={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId}
                                    teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId)?.name!}
                                    variant={(currentUser.role === 'REFEREE' || currentUser.role === 'MAIN_REFEREE') ? 'referee' : 'default'}
                                    isVertical={isVertical}
                                />
                            </div>
                        </div>
                     </div>
                </div>
          </div>
      )}
      
      {/* 4. TEAMS MANAGEMENT VIEW */}
      {currentView === 'teams' && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
               <div className="flex justify-between items-center border-b border-white/10 pb-4">
                   <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Gestión de <span className="text-vnl-accent">Equipos</span></h2>
               </div>
               
               {/* Team Form (Add or Edit) */}
               {isAdmin && (
                   <div className={`p-4 sm:p-6 border rounded-2xl relative overflow-hidden transition-all duration-300 shadow-xl ${
                       editingTeamId 
                           ? 'bg-gradient-to-br from-yellow-950/20 via-corp-panel to-corp-panel border-yellow-500/50 shadow-yellow-500/10' 
                           : 'bg-corp-panel border-white/10'
                   }`}>
                       {editingTeamId ? (
                           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-3 border-b border-yellow-500/30">
                               <div className="flex items-center gap-2">
                                   <span className="w-7 h-7 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold text-sm">
                                       ✏️
                                   </span>
                                   <div>
                                       <h3 className="text-sm font-black text-yellow-400 uppercase tracking-widest">
                                           Modificando Equipo: <span className="text-white">{registeredTeams.find(t => t.id === editingTeamId)?.name || newTeamName}</span>
                                       </h3>
                                       <p className="text-[11px] text-slate-400">Edita el nombre, coach, escudo o color y guarda los cambios.</p>
                                   </div>
                               </div>
                               <button
                                   type="button"
                                   onClick={cancelEditTeam}
                                   className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider transition"
                               >
                                   ✕ Cancelar edición
                               </button>
                           </div>
                       ) : (
                           <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                               <span className="w-7 h-7 rounded-lg bg-vnl-accent/20 text-vnl-accent flex items-center justify-center font-bold text-sm">
                                   +
                               </span>
                               <div>
                                   <h3 className="text-sm font-black text-vnl-accent uppercase tracking-widest">Registrar Nuevo Equipo</h3>
                                   <p className="text-[11px] text-slate-400">Agrega clubes o selecciones con su escudo y plantilla oficial de 12 jugadores.</p>
                               </div>
                           </div>
                       )}

                       <form onSubmit={handleAddTeam} className="space-y-4">
                           <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                               
                               {/* Team Name */}
                               <div className="md:col-span-4">
                                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                       Nombre del Equipo *
                                   </label>
                                   <input 
                                       type="text"
                                       value={newTeamName} 
                                       onChange={e => setNewTeamName(e.target.value)} 
                                       className="w-full p-3 bg-black/40 border border-white/15 rounded-xl text-sm text-white font-bold focus:border-vnl-accent outline-none min-h-[46px]" 
                                       placeholder="Ej: Águilas del Vóley" 
                                       required 
                                   />
                               </div>

                               {/* Coach Name */}
                               <div className="md:col-span-3">
                                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                       Director Técnico / Coach
                                   </label>
                                   <input 
                                       type="text"
                                       value={newTeamCoach} 
                                       onChange={e => setNewTeamCoach(e.target.value)} 
                                       className="w-full p-3 bg-black/40 border border-white/15 rounded-xl text-sm text-white font-bold focus:border-vnl-accent outline-none min-h-[46px]" 
                                       placeholder="Ej: Marcelo Méndez" 
                                   />
                               </div>

                               {/* Logo / Image Picker Button */}
                               <div className="md:col-span-3">
                                   <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                       Escudo / Logo del Club
                                   </label>
                                   <div className="flex items-center gap-2">
                                       <button
                                           type="button"
                                           onClick={() => setShowTeamLogoModal(true)}
                                           className="flex-grow p-2.5 bg-white/5 hover:bg-white/10 border border-white/15 hover:border-vnl-accent rounded-xl text-left flex items-center gap-3 transition min-h-[46px] group"
                                       >
                                           <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                                               {newTeamLogo ? (
                                                   <img src={newTeamLogo} alt="Logo" className="w-full h-full object-contain" />
                                               ) : (
                                                   <span className="text-base">🛡️</span>
                                               )}
                                           </div>
                                           <div className="min-w-0 flex-grow">
                                               <span className="text-xs font-bold text-white block truncate">
                                                   {newTeamLogo ? 'Cambiar Escudo' : 'Elegir Escudo'}
                                               </span>
                                               <span className="text-[10px] text-vnl-accent font-semibold block">Galería / Subir</span>
                                           </div>
                                       </button>
                                       {newTeamLogo && (
                                           <button
                                               type="button"
                                               onClick={() => setNewTeamLogo('')}
                                               className="w-9 h-9 rounded-xl bg-red-500/20 text-red-400 hover:text-white hover:bg-red-500/40 flex items-center justify-center shrink-0 text-sm font-bold transition"
                                               title="Quitar escudo"
                                           >
                                               ✕
                                           </button>
                                       )}
                                   </div>
                               </div>

                               {/* Action Buttons */}
                               <div className="md:col-span-2 flex flex-col sm:flex-row md:flex-col gap-2">
                                   <button 
                                       type="submit" 
                                       className={`w-full py-3 px-5 rounded-xl font-black text-xs uppercase tracking-wider transition min-h-[46px] shadow-lg flex items-center justify-center gap-2 active:scale-95 ${
                                           editingTeamId
                                               ? 'bg-yellow-400 hover:bg-yellow-300 text-black shadow-yellow-400/20'
                                               : 'bg-vnl-accent hover:bg-cyan-400 text-black shadow-cyan-400/20'
                                       }`}
                                   >
                                       <span>{editingTeamId ? '✓' : '+'}</span>
                                       <span>{editingTeamId ? 'Guardar' : 'Agregar'}</span>
                                   </button>
                                   {editingTeamId && (
                                       <button 
                                           type="button" 
                                           onClick={cancelEditTeam} 
                                           className="w-full py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs uppercase tracking-wider transition min-h-[46px] flex items-center justify-center"
                                       >
                                           Cancelar
                                       </button>
                                   )}
                               </div>

                           </div>
                       </form>
                   </div>
               )}

               {/* Teams List */}
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                   {registeredTeams.map(team => (
                       <div key={team.id} className="bg-corp-panel border border-white/10 rounded-2xl overflow-hidden group hover:border-vnl-accent/40 transition-all duration-200 shadow-lg flex flex-col">
                           {/* Team Header */}
                           <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-950/40 via-corp-panel to-transparent flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5">
                               <div className="flex items-center gap-3.5 min-w-0">
                                   <div className="w-12 h-12 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                                       {team.logoUrl ? (
                                           <img src={team.logoUrl} alt={team.name} className="w-full h-full object-contain p-1 drop-shadow" />
                                       ) : (
                                           <div className="w-full h-full flex items-center justify-center font-black text-white text-lg bg-gradient-to-br from-blue-600 to-indigo-800">
                                               {team.name?.[0] || 'E'}
                                           </div>
                                       )}
                                   </div>
                                   <div className="min-w-0 flex-grow">
                                       <h3 className="font-black text-white text-lg sm:text-xl uppercase italic tracking-tight truncate">
                                           {team.name || 'Sin nombre'}
                                       </h3>
                                       <div className="flex items-center gap-2 mt-0.5">
                                           <span className="text-[11px] font-bold text-slate-400 tracking-wider">
                                               DT: {team.coachName || 'Sin entrenador'}
                                           </span>
                                           <span className="text-slate-600">·</span>
                                           <span className="text-[11px] font-mono text-cyan-400 font-semibold">
                                               {(team.players || []).length} Jugadores
                                           </span>
                                       </div>
                                   </div>
                               </div>

                               {isAdmin && (
                                   <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                       <button 
                                           onClick={() => handleEditTeam(team)} 
                                           className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-yellow-500/15 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-300 hover:text-yellow-200 font-bold text-xs uppercase tracking-wider transition active:scale-95 min-h-[40px]"
                                           title="Modificar nombre, DT o escudo"
                                       >
                                           <span>✏️</span>
                                           <span>Modificar</span>
                                       </button>
                                       <button 
                                           onClick={() => handleDeleteTeam(team.id)} 
                                           className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/30 border border-red-500/40 text-red-300 hover:text-red-200 font-bold text-xs uppercase tracking-wider transition active:scale-95 min-h-[40px]"
                                           title="Eliminar equipo"
                                       >
                                           <span>🗑️</span>
                                           <span>Eliminar</span>
                                       </button>
                                   </div>
                               )}
                           </div>
                           
                           {/* Players Grid */}
                           <div className="p-4 sm:p-5 flex-grow space-y-3">
                               <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                                   <span>Plantilla Oficial</span>
                                   <span className="text-vnl-accent text-[10px]">Toca un jugador para editar</span>
                               </div>
                               <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                   {(team.players || []).map(p => (
                                       <div 
                                         key={p.id} 
                                         onClick={() => setEditingPlayer(p)}
                                         className="bg-black/30 hover:bg-white/10 p-2.5 rounded-xl border border-white/5 hover:border-vnl-accent/50 flex flex-col items-center cursor-pointer transition-all duration-150 group/player relative"
                                         title={`Toca para editar ficha de ${p.name}`}
                                       >
                                           <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-black text-white mb-1.5 overflow-hidden border border-white/10 group-hover/player:border-vnl-accent">
                                               {p.profile?.photoUrl ? (
                                                   <img src={p.profile.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                                               ) : (
                                                   `#${p.number}`
                                               )}
                                           </div>
                                           <span className="text-[10px] font-bold text-slate-300 uppercase truncate w-full text-center group-hover/player:text-white">
                                               {(p.name || `Jugador ${p.number}`).split(' ')[0]}
                                           </span>
                                           <span className="text-[9px] font-semibold text-slate-500 truncate w-full text-center">
                                               {p.role || 'Jugador'}
                                           </span>
                                           {p.isCaptain && (
                                               <span className="absolute top-1 right-1 text-[10px]" title="Capitán">⭐</span>
                                           )}
                                       </div>
                                   ))}
                               </div>
                           </div>
                       </div>
                   ))}
               </div>
          </div>
      )}

      {/* 5. USERS VIEW */}
      {currentView === 'users' && (
          <UserManagement 
            users={users} 
            teams={registeredTeams}
            currentUser={currentUser}
            onAddUser={handleAddUser}
            onDeleteUser={handleDeleteUser}
            onUpdateUser={handleUpdateUser}
            onSystemReset={isAdmin ? handleSystemReset : undefined}
          />
      )}

      {/* 5. FIXTURE VIEW */}
      {currentView === 'fixture' && activeTournament && (
          <div className="space-y-6">
              <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                  <button onClick={() => setCurrentView('dashboard')} className="text-slate-500 hover:text-white transition">← Volver</button>
                  <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">
                      Filtrar <span className="text-vnl-accent">Fixture</span>
                  </h2>
              </div>
              <div className="bg-corp-panel border border-white/10 rounded-xl p-4 flex flex-col gap-6">
                 {/* Top Actions */}
                 <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                     <button onClick={() => setShowBracket(!showBracket)} className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition ${!showBracket ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                         {!showBracket ? '✓ Modo Lista' : 'Modo Lista'}
                     </button>
                      <button onClick={() => setShowBracket(!showBracket)} className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition ${showBracket ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                         {showBracket ? '✓ Bracket / Llaves' : 'Bracket / Llaves'}
                     </button>
                 </div>
                 
                 {showBracket ? (
                     <TournamentBracket tournament={activeTournament} resolveTeam={resolveTeam} />
                 ) : (
                     <div className="grid gap-4">
                       {activeTournament.fixtures?.map((fix) => {
                           const teamA = resolveTeam(fix.teamAId, activeTournament.teams);
                           const teamB = resolveTeam(fix.teamBId, activeTournament.teams);
                           if (!teamA || !teamB) return null;

                           const isLive = fix.status === 'live';
                           const isFinished = fix.status === 'finished';

                           return (
                               <div key={fix.id} className={`bg-black/30 border ${isLive ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'border-white/10'} rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4 group transition hover:bg-white/5`}>
                                   <div className="flex items-center gap-4 w-full md:w-1/3">
                                       <div className="text-center w-12 shrink-0">
                                           <div className="text-xs font-bold text-slate-500 uppercase">{new Date(fix.date).getDate()}</div>
                                           <div className="text-[10px] font-black text-slate-600 uppercase">{new Date(fix.date).toLocaleString('es-ES', { month: 'short' })}</div>
                                       </div>
                                       <div className="flex flex-col">
                                           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{fix.group}</span>
                                           <div className="flex items-center gap-2">
                                               {isLive && <span className="bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase inline-block animate-pulse mt-1">EN VIVO</span>}
                                               {isFinished && <span className="bg-slate-700 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase inline-block mt-1">FINAL</span>}
                                           </div>
                                       </div>
                                   </div>

                                   <div className="flex items-center justify-center gap-4 w-full md:w-1/3">
                                       <div className={`flex items-center justify-end w-1/3 gap-2 ${fix.winnerId === teamA.id ? 'text-yellow-400' : 'text-white'}`}>
                                           <span className="font-bold uppercase text-sm md:text-base text-right max-w-[100px] truncate">{teamA.name}</span>
                                           {teamA.logoUrl && <img src={teamA.logoUrl} className="w-8 h-8 object-contain shrink-0" />}
                                       </div>
                                       <span className="text-white/50 font-black italic">VS</span>
                                       <div className={`flex items-center justify-start w-1/3 gap-2 ${fix.winnerId === teamB.id ? 'text-yellow-400' : 'text-white'}`}>
                                           {teamB.logoUrl && <img src={teamB.logoUrl} className="w-8 h-8 object-contain shrink-0" />}
                                           <span className="font-bold uppercase text-sm md:text-base max-w-[100px] truncate">{teamB.name}</span>
                                       </div>
                                   </div>
                                    <div className="w-full md:w-1/3 flex justify-end gap-2 text-right">
                                        <span className="text-xl font-black font-mono">{isLive || isFinished ? fix.resultString || '0-0' : '-'}</span>
                                    </div>
                               </div>
                           );
                       })}
                     </div>
                 )}
              </div>
          </div>
      )}

      {/* 6. STANDINGS VIEW */}
      {currentView === 'standings' && activeTournament && (
         <div className="space-y-6">
             <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                 <button onClick={() => setCurrentView('dashboard')} className="text-slate-500 hover:text-white transition">← Volver</button>
                 <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Tabla de <span className="text-vnl-accent">Posiciones</span></h2>
             </div>
             <StandingsTable tournament={activeTournament} />
         </div>
      )}

      {/* 7. STATS VIEW */}
      {currentView === 'stats' && activeTournament && (
          <div className="space-y-6">
             <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                 <button onClick={() => setCurrentView('dashboard')} className="text-slate-500 hover:text-white transition">← Volver</button>
                 <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Top <span className="text-vnl-accent">Players</span></h2>
             </div>
             <TopPlayers tournament={activeTournament} />
          </div>
      )}

      {/* MODALS */}
      
      {/* Set Stats Modal (Auto or Manual) */}
      {viewingSetStats && activeTournament && activeTournament.fixtures?.find(f => f.id === liveMatch?.matchId) && (
          (() => {
              const fix = activeTournament.fixtures.find(f => f.id === liveMatch?.matchId);
              const tA = activeTournament.teams.find(t => t.id === fix?.teamAId);
              const tB = activeTournament.teams.find(t => t.id === fix?.teamBId);
              if (!tA || !tB) return null;
              
              return (
                  <SetStatsModal 
                      setNumber={viewingSetStats.setNum}
                      setData={viewingSetStats.data}
                      teamA={tA}
                      teamB={tB}
                      onClose={() => setViewingSetStats(null)}
                      onNextSet={() => { handleStartNextSet(); setViewingSetStats(null); }}
                      showNextButton={canControlMatch && liveMatch?.status === 'finished_set'}
                      onShowOnTV={() => {
                          if (canControlMatch) {
                              updateLiveMatch(prev => prev ? { ...prev, showStats: true, showScoreboard: false, statsSetIndex: viewingSetStats.setNum - 1 } : null);
                          }
                      }}
                      onHideFromTV={() => {
                          if (canControlMatch) {
                              updateLiveMatch(prev => prev ? { ...prev, showStats: false, showScoreboard: true } : null);
                          }
                      }}
                  />
              );
          })()
      )}
      
      {/* MVP Selection Modal */}
      {showMvpModal && liveMatch && activeTournament && (
          <div className="fixed inset-0 bg-black/95 z-[120] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md overflow-y-auto">
              <div className="bg-vnl-panel border border-white/20 p-5 sm:p-6 w-full max-w-4xl shadow-[0_0_50px_rgba(255,215,0,0.2)] rounded-2xl max-h-[92vh] overflow-y-auto">
                  <h3 className="text-3xl font-black text-yellow-400 uppercase italic tracking-tighter mb-2 text-center">🌟 Elegir MVP del Partido 🌟</h3>
                  <p className="text-center text-slate-400 text-sm mb-8 uppercase tracking-widest">Selecciona al jugador más valioso para finalizar el encuentro</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Team A */}
                      <div>
                          <h4 className="text-xl font-bold text-white uppercase border-b border-white/10 pb-2 mb-4 text-center">
                              {activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId)?.name}
                          </h4>
                          <div className="grid grid-cols-2 gap-2">
                              {activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId)?.players.map(p => {
                                   const matchPoints = liveMatch.sets.flatMap(s => s.history).filter(h => h.playerId === p.id && (h.type === 'attack' || h.type === 'block' || h.type === 'ace')).length;
                                   return (
                                      <button 
                                          key={p.id}
                                          onClick={() => handleConfirmMatchEnd(p.id)}
                                          className="bg-white/5 hover:bg-yellow-500/20 hover:border-yellow-500/50 border border-white/10 p-3 rounded flex flex-col items-center gap-1 transition group"
                                      >
                                          <span className="text-2xl font-black text-slate-700 group-hover:text-yellow-400 transition">#{p.number}</span>
                                          <span className="text-xs font-bold text-white uppercase truncate w-full text-center">{p.name}</span>
                                          <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-300 group-hover:bg-yellow-500 group-hover:text-black transition">{matchPoints} Pts</span>
                                      </button>
                                   );
                              })}
                          </div>
                      </div>

                      {/* Team B */}
                      <div>
                          <h4 className="text-xl font-bold text-white uppercase border-b border-white/10 pb-2 mb-4 text-center">
                              {activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId)?.name}
                          </h4>
                          <div className="grid grid-cols-2 gap-2">
                              {activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId)?.players.map(p => {
                                   const matchPoints = liveMatch.sets.flatMap(s => s.history).filter(h => h.playerId === p.id && (h.type === 'attack' || h.type === 'block' || h.type === 'ace')).length;
                                   return (
                                      <button 
                                          key={p.id}
                                          onClick={() => handleConfirmMatchEnd(p.id)}
                                          className="bg-white/5 hover:bg-yellow-500/20 hover:border-yellow-500/50 border border-white/10 p-3 rounded flex flex-col items-center gap-1 transition group"
                                      >
                                          <span className="text-2xl font-black text-slate-700 group-hover:text-yellow-400 transition">#{p.number}</span>
                                          <span className="text-xs font-bold text-white uppercase truncate w-full text-center">{p.name}</span>
                                          <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-slate-300 group-hover:bg-yellow-500 group-hover:text-black transition">{matchPoints} Pts</span>
                                      </button>
                                   );
                              })}
                          </div>
                      </div>
                  </div>

                  <div className="mt-8 flex justify-center gap-8">
                      <button onClick={() => handleConfirmMatchEnd(null)} className="text-slate-500 text-xs font-bold uppercase tracking-widest hover:text-white transition">
                          Finalizar sin MVP
                      </button>
                      <button onClick={() => setShowMvpModal(false)} className="text-red-500 text-xs font-bold uppercase tracking-widest hover:text-red-400 transition">
                          Cancelar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Edit Tournament Modal */}
      {showEditTourneyModal && (
          <div className="fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md overflow-y-auto">
              <div className="bg-vnl-panel border border-white/20 p-5 sm:p-6 w-full max-w-lg shadow-[0_0_50px_rgba(6,182,212,0.2)] rounded-2xl max-h-[92vh] overflow-y-auto">
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-6 border-b border-white/10 pb-2">Editar Torneo</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre</label>
                          <input value={editTourneyData.name} onChange={e => setEditTourneyData({...editTourneyData, name: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Formato</label>
                              <select 
                                value={editTourneyData.format} 
                                onChange={e => setEditTourneyData({...editTourneyData, format: e.target.value as any})} 
                                className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none"
                              >
                                  <option value="LEAGUE">Liga (Todos contra Todos)</option>
                                  <option value="GROUPS">Fase de Grupos</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fase Final</label>
                              <select 
                                value={editTourneyData.knockout} 
                                onChange={e => setEditTourneyData({...editTourneyData, knockout: e.target.value as any})} 
                                className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none"
                              >
                                  <option value="SEMIS">Semifinal + Final (Top 4)</option>
                                  <option value="FINAL">Solo Final (Top 2)</option>
                                  <option value="NONE">Sin Fase Final</option>
                              </select>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Inicio</label>
                              <input type="date" value={editTourneyData.startDate} onChange={e => setEditTourneyData({...editTourneyData, startDate: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fin</label>
                              <input type="date" value={editTourneyData.endDate} onChange={e => setEditTourneyData({...editTourneyData, endDate: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                          </div>
                      </div>
                      
                      <div className="bg-red-900/20 border border-red-500/30 p-3 rounded text-xs text-red-300 font-bold">
                          ⚠️ Advertencia: Cambiar el formato o las fechas regenerará todo el fixture y borrará los resultados existentes.
                      </div>

                      <button onClick={handleUpdateTournament} disabled={loading} className="w-full bg-vnl-accent hover:bg-cyan-400 text-black font-black py-3.5 rounded-xl uppercase tracking-widest text-xs shadow-lg transition mt-4 flex items-center justify-center gap-2 min-h-[44px]">
                          {loading ? 'Actualizando...' : 'Guardar Cambios'}
                      </button>
                      <button onClick={() => setShowEditTourneyModal(false)} className="w-full text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-white transition py-2.5">Cancelar</button>
                  </div>
              </div>
          </div>
      )}

      {/* Create Tournament Modal */}
      {showCreateTourneyModal && (
          <div className="fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md overflow-y-auto">
              <div className="bg-vnl-panel border border-white/20 p-5 sm:p-6 w-full max-w-lg shadow-[0_0_50px_rgba(6,182,212,0.2)] rounded-2xl max-h-[92vh] overflow-y-auto">
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-6 border-b border-white/10 pb-2">Nuevo Torneo</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre</label>
                          <input value={newTourneyData.name} onChange={e => setNewTourneyData({...newTourneyData, name: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" placeholder="Ej: Copa Verano 2024" />
                      </div>
                      
                      {/* LOGO UPLOAD SECTION */}
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Logo del Torneo (Opcional)</label>
                          <div className="flex gap-2 items-center">
                              <button
                                  type="button"
                                  onClick={() => setShowTourneyLogoModal(true)}
                                  className="flex-1 bg-black/40 hover:bg-white/5 border border-white/15 hover:border-vnl-accent rounded-xl p-3 flex items-center justify-center gap-2 transition group min-h-[46px]"
                              >
                                  <span className="text-xl">🏆</span>
                                  <span className="text-xs font-bold text-slate-300 group-hover:text-white uppercase tracking-wider">
                                      {newTourneyData.logoUrl ? 'Cambiar Logo' : 'Galería / Subir Logo'}
                                  </span>
                              </button>
                              
                              {newTourneyData.logoUrl && (
                                  <div className="w-14 h-14 bg-black/40 rounded-xl border border-white/10 flex items-center justify-center p-1 relative shrink-0">
                                      <img src={newTourneyData.logoUrl} className="max-w-full max-h-full object-contain" />
                                      <button 
                                          onClick={() => setNewTourneyData(prev => ({...prev, logoUrl: ''}))}
                                          className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-sm"
                                          title="Quitar logo"
                                      >
                                          ✕
                                      </button>
                                  </div>
                              )}
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Formato</label>
                              <select 
                                value={newTourneyData.format} 
                                onChange={e => setNewTourneyData({...newTourneyData, format: e.target.value as 'LEAGUE' | 'GROUPS' | 'KNOCKOUT_4'})} 
                                className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none"
                              >
                                  <option value="LEAGUE">Liga (Todos contra Todos)</option>
                                  <option value="GROUPS">Fase de Grupos</option>
                                  <option value="KNOCKOUT_4">Eliminatoria (4 Equipos)</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fase Final</label>
                              <select 
                                value={newTourneyData.knockout} 
                                onChange={e => setNewTourneyData({...newTourneyData, knockout: e.target.value as 'SEMIS' | 'FINAL' | 'NONE'})} 
                                className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none"
                              >
                                  <option value="SEMIS">Semifinal + Final (Top 4)</option>
                                  <option value="FINAL">Solo Final (Top 2)</option>
                                  <option value="NONE">Sin Fase Final</option>
                              </select>
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Inicio</label>
                              <input type="date" value={newTourneyData.startDate} onChange={e => setNewTourneyData({...newTourneyData, startDate: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fin</label>
                              <input type="date" value={newTourneyData.endDate} onChange={e => setNewTourneyData({...newTourneyData, endDate: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                          </div>
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Días de Partido (IA)</label>
                          <div className="flex flex-wrap gap-2">
                              {DAYS_OF_WEEK.map(day => (
                                  <button 
                                    key={day} 
                                    onClick={() => toggleDaySelection(day)}
                                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition border ${newTourneyData.matchDays.includes(day) ? 'bg-vnl-accent text-black border-vnl-accent' : 'bg-black/40 text-slate-500 border-white/10 hover:border-white'}`}
                                  >
                                      {day.substring(0,3)}
                                  </button>
                              ))}
                          </div>
                      </div>
                      
                      {/* TEAM SELECTION */}
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Equipos Participantes ({selectedTeamIds.length})</label>
                          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-black/20 rounded border border-white/5">
                              {registeredTeams.map(team => (
                                  <button
                                      key={team.id}
                                      onClick={() => toggleTeamSelection(team.id)}
                                      className={`flex items-center gap-2 p-2 rounded text-xs font-bold uppercase transition border ${selectedTeamIds.includes(team.id) ? 'bg-vnl-accent/20 text-vnl-accent border-vnl-accent' : 'bg-black/40 text-slate-500 border-white/10 hover:border-white/30'}`}
                                  >
                                      <div className={`w-3 h-3 rounded-full border ${selectedTeamIds.includes(team.id) ? 'bg-vnl-accent border-vnl-accent' : 'border-slate-500'}`}></div>
                                      <span className="truncate">{team.name}</span>
                                  </button>
                              ))}
                          </div>
                          {registeredTeams.length === 0 && <p className="text-xs text-red-400 mt-1">No hay equipos registrados.</p>}
                      </div>
                      <button onClick={handleCreateTournament} disabled={loading} className="w-full bg-vnl-accent hover:bg-cyan-400 text-black font-black py-4 uppercase tracking-widest text-sm shadow-lg transition mt-4 flex items-center justify-center gap-2">
                          {loading ? 'Generando Fixture...' : 'Crear & Generar Fixture'}
                      </button>
                      <button onClick={() => setShowCreateTourneyModal(false)} className="w-full text-slate-500 text-xs font-bold uppercase tracking-widest hover:text-white transition">Cancelar</button>
                  </div>
              </div>
          </div>
      )}

      {/* Match Config Modal (Pre-Match or Edit Rules) */}
      {showMatchConfigModal && activeTournament && (
          <div className="fixed inset-0 bg-black/90 z-[120] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md overflow-y-auto">
              <div className="bg-vnl-panel border border-white/20 p-5 sm:p-6 w-full max-w-md shadow-2xl rounded-2xl max-h-[92vh] overflow-y-auto">
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-4">{isEditingRules ? 'Editar Reglas' : 'Configurar Partido'}</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Sets Máximos</label>
                          <div className="flex gap-2 bg-black/40 p-1 rounded-xl border border-white/10">
                              {[1, 3, 5].map(n => (
                                  <button key={n} onClick={() => setMatchConfig({...matchConfig, maxSets: n})} className={`flex-1 py-2.5 text-xs font-bold uppercase rounded-lg transition min-h-[40px] ${matchConfig.maxSets === n ? 'bg-vnl-accent text-black shadow' : 'text-slate-400 hover:text-white'}`}>{n} Sets</button>
                              ))}
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Puntos por Set</label>
                              <input type="number" value={matchConfig.pointsPerSet} onChange={e => setMatchConfig({...matchConfig, pointsPerSet: parseInt(e.target.value)})} className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white font-bold text-center" />
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tie Break</label>
                              <input type="number" value={matchConfig.tieBreakPoints} onChange={e => setMatchConfig({...matchConfig, tieBreakPoints: parseInt(e.target.value)})} className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-white font-bold text-center" />
                          </div>
                      </div>
                      <button onClick={handleSaveConfig} className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-3.5 rounded-xl uppercase tracking-widest text-xs shadow-lg transition mt-2 min-h-[44px]">
                          {isEditingRules ? 'Guardar Cambios' : 'CONFIRMAR INICIO'}
                      </button>
                      <button onClick={() => setShowMatchConfigModal(null)} className="w-full text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-white transition py-2.5">Cancelar</button>
                  </div>
              </div>
          </div>
      )}

      {/* Substitution Modal */}
      {showSubModal && liveMatch && activeTournament && (
          <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-3 sm:p-6 backdrop-blur-sm overflow-y-auto">
              <div className="bg-vnl-panel border border-white/20 p-5 sm:p-6 w-full max-w-sm shadow-2xl rounded-2xl max-h-[92vh] overflow-y-auto">
                  <h3 className="text-lg font-black text-white uppercase italic tracking-tighter mb-4 text-center">Realizar Cambio</h3>
                  <div className="flex items-center justify-center gap-4 mb-6">
                       <div className="text-center">
                           <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Sale (#)</label>
                           <input 
                             type="number" 
                             value={subPlayerOutNum} 
                             onChange={e => setSubPlayerOutNum(e.target.value)} 
                             className="w-16 h-16 bg-red-900/20 border border-red-500/50 text-white font-black text-2xl text-center rounded focus:outline-none focus:border-red-500"
                             placeholder="OUT"
                           />
                       </div>
                       <span className="text-2xl text-slate-500">→</span>
                       <div className="text-center">
                           <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Entra (#)</label>
                           <input 
                             type="number" 
                             value={subPlayerInNum} 
                             onChange={e => setSubPlayerInNum(e.target.value)} 
                             className="w-16 h-16 bg-green-900/20 border border-green-500/50 text-white font-black text-2xl text-center rounded focus:outline-none focus:border-green-500"
                             placeholder="IN"
                           />
                       </div>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={() => setShowSubModal(null)} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 rounded text-xs font-bold uppercase">Cancelar</button>
                      <button onClick={handleConfirmSub} className="flex-1 bg-vnl-accent hover:bg-cyan-400 text-black py-3 rounded text-xs font-black uppercase shadow-[0_0_15px_rgba(6,182,212,0.3)]">Confirmar</button>
                  </div>
              </div>
          </div>
      )}
      
      {/* Rotation Editor Modal */}
      {showRotationModal && liveMatch && (
          <div className="fixed inset-0 bg-black/85 z-[120] flex items-center justify-center p-3 sm:p-6 backdrop-blur-md overflow-y-auto">
              <div className="bg-vnl-panel border border-white/20 p-5 sm:p-6 w-full max-w-md shadow-2xl rounded-2xl max-h-[92vh] overflow-y-auto">
                   <h3 className="text-lg font-black text-white uppercase italic tracking-tighter mb-4 text-center">Editar Rotación (P1 - P6)</h3>
                   <div className="grid grid-cols-3 gap-2.5 mb-6">
                       {[0, 1, 2, 3, 4, 5].map(i => (
                           <div key={i} className="text-center">
                               <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pos {i+1}</label>
                               <input 
                                 type="number"
                                 value={rotationInput[i] || ''}
                                 onChange={e => {
                                     const newRot = [...rotationInput];
                                     newRot[i] = e.target.value;
                                     setRotationInput(newRot);
                                 }}
                                 className="w-full p-2.5 bg-black/40 border border-white/15 rounded-xl text-white font-bold text-center focus:border-vnl-accent outline-none text-base"
                               />
                           </div>
                       ))}
                   </div>
                   <div className="flex gap-2">
                      <button onClick={() => setShowRotationModal(null)} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl text-xs font-bold uppercase min-h-[44px]">Cancelar</button>
                      <button onClick={handleUpdateRotation} className="flex-1 bg-vnl-accent hover:bg-cyan-400 text-black py-3 rounded-xl text-xs font-black uppercase shadow-[0_0_15px_rgba(6,182,212,0.3)] min-h-[44px]">Actualizar</button>
                   </div>
              </div>
          </div>
      )}

      {/* Player Profile Editor */}
      {editingPlayer && currentUser && (
          <ProfileEditor 
            player={editingPlayer} 
            currentUser={currentUser}
            onClose={() => setEditingPlayer(null)}
            onSave={(updated) => {
                updateTeams(prev => prev.map(t => {
                    const pIndex = (t.players || []).findIndex(p => p.id === updated.id);
                    if (pIndex !== -1) {
                        const newPlayers = [...t.players];
                        newPlayers[pIndex] = updated;
                        return { ...t, players: newPlayers };
                    }
                    return t;
                }));
                setEditingPlayer(null);
            }}
          />
      )}

      {/* ROTATION VIEW OVERLAY */}
      {liveMatch?.showRotation && ['ADMIN', 'MAIN_REFEREE', 'REFEREE'].includes(currentUser?.role || '') && activeTournament && (
          <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-md">
              <div className="w-full max-w-4xl flex justify-between items-center mb-4">
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Vista de Rotación en Vivo</h3>
                  <button onClick={handleToggleRotationView} className="bg-red-500/20 hover:bg-red-500/40 text-red-500 px-4 py-2 rounded font-bold uppercase text-xs">Cerrar</button>
              </div>
              <div className="w-full max-w-4xl bg-vnl-panel border border-white/20 p-4 rounded shadow-2xl flex flex-col gap-4 overflow-y-auto max-h-[80vh]">
                  <Court 
                      players={liveMatch.rotationA} 
                      serving={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId}
                      teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId)?.name!}
                      variant="referee"
                      isVertical={false}
                  />
                  <div className="h-2 w-full bg-white/10 rounded-full my-2"></div>
                  <Court 
                      players={liveMatch.rotationB} 
                      serving={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId}
                      teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId)?.name!}
                      variant="referee"
                      isVertical={false}
                  />
              </div>
          </div>
      )}

      {/* STREAM GUIDE MODAL */}
      <StreamGuideModal 
        isOpen={showStreamGuide} 
        onClose={() => setShowStreamGuide(false)} 
        matchUrl={window.location.href} 
      />

      {/* TEAM LOGO IMAGE PICKER MODAL */}
      <ImageSelectorModal
        isOpen={showTeamLogoModal}
        title="Escudo / Logo del Club"
        currentImage={newTeamLogo}
        targetType="team"
        onSelectImage={(url) => setNewTeamLogo(url)}
        onClose={() => setShowTeamLogoModal(false)}
      />

      {/* TOURNAMENT LOGO IMAGE PICKER MODAL */}
      <ImageSelectorModal
        isOpen={showTourneyLogoModal}
        title="Logo Oficial del Torneo"
        currentImage={newTourneyData.logoUrl}
        targetType="team"
        onSelectImage={(url) => setNewTourneyData(prev => ({ ...prev, logoUrl: url }))}
        onClose={() => setShowTourneyLogoModal(false)}
      />

    </Layout>
  );
};

export default App;