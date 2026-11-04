
export enum Position {
  P1 = 1, // Defense Right (Server)
  P2 = 2, // Attack Right
  P3 = 3, // Attack Center
  P4 = 4, // Attack Left
  P5 = 5, // Defense Left
  P6 = 6, // Defense Center
}

export enum PlayerRole {
  Setter = 'Armador',
  OutsideHitter = 'Punta',
  Opposite = 'Opuesto',
  MiddleBlocker = 'Central',
  Libero = 'Libero',
  DefensiveSpecialist = 'Defensa'
}

export interface PlayerProfileDetails {
  bio: string;
  height: number; // cm
  weight: number; // kg
  spikeReach?: number; // cm
  blockReach?: number; // cm
  birthDate?: string;
  photoUrl: string;
  achievements: string[];
  instagram?: string;
}

export interface Player {
  id: string;
  name: string;
  number: number;
  role: PlayerRole;
  isCaptain: boolean; // New field
  stats: PlayerStats;
  profile: PlayerProfileDetails;
}

export interface PlayerStats {
  points: number;
  aces: number;
  blocks: number;
  errors: number;
  matchesPlayed: number;
  mvps: number;
  yellowCards: number; // Added
  redCards: number;    // Added
}

export interface Team {
  id: string;
  name: string;
  color: string;
  logoUrl?: string;
  players: Player[];
  coachName: string;
}

export interface MatchSet {
  scoreA: number;
  scoreB: number;
  history: PointLog[];
  durationMinutes: number;
}

export interface PointLog {
  teamId: string;
  playerId?: string;
  type: 'attack' | 'block' | 'ace' | 'opponent_error' | 'yellow_card' | 'red_card';
  scoreSnapshot: string; // "24-23"
}

export interface Tournament {
  id: string;
  ownerId: string; // ID of the ADMIN who created it
  name: string;
  logoUrl?: string;
  startDate: string;
  endDate: string;
  teams: Team[];
  groups: { [key: string]: string[] }; // Group Name -> Array of Team IDs
  fixtures: MatchFixture[];
  format?: 'LEAGUE' | 'GROUPS';
  knockout?: 'SEMIS' | 'FINAL' | 'NONE';
}

export interface MatchFixture {
  id: string;
  date: string;
  teamAId: string;
  teamBId: string;
  group: string;
  status: 'scheduled' | 'live' | 'finished';
  winnerId?: string;
  resultString?: string; // "3-1"
}

export interface MatchConfig {
  maxSets: number; // 1, 3, 5
  pointsPerSet: number; // 25, 21, 15
  tieBreakPoints: number; // 15
}

// Live Match State
export interface LiveMatchState {
  matchId: string;
  config: MatchConfig;
  status: 'warmup' | 'playing' | 'paused' | 'finished_set' | 'finished'; // Added finished_set
  currentSet: number;
  sets: MatchSet[];
  rotationA: Player[]; // 6 players on court
  rotationB: Player[]; // 6 players on court
  benchA: Player[];
  benchB: Player[];
  servingTeamId: string; // ID of team currently serving
  scoreA: number;
  scoreB: number;
  timeoutsA: number; // Max 2 per set
  timeoutsB: number;
  substitutionsA: number; // Max 6 per set typically
  substitutionsB: number;
  requests: RequestItem[]; // Requests from coaches
  showLeaderboard?: boolean;
  showStats?: boolean;     // Sync TV state
  showScoreboard?: boolean;// Sync TV state
  showRotation?: boolean;  // Sync TV state
  statsSetIndex?: number;  // If defined, show stats for this set index (0-based). If undefined, show match total.
  adminPeerId?: string;    // PeerJS ID for live streaming
  tvSettings?: {
    style: 'horizontal' | 'vertical';
    triggerInLogoTransition?: number;
    triggerHawkEye?: number;
    hawkEyeStatus?: 'in' | 'out' | null;
    showPlayerStats?: boolean;
    showTeamStats?: boolean | string;
    featuredPlayerId?: string;
    featuredPlayerMode?: 'presentation' | 'stats' | null;
    showVersus?: boolean | string;
    showServeSpeed?: boolean;
    triggerSetPoint?: number;
    triggerMatchPoint?: number;
    forceCameraChangeTrigger?: number;
    showFormations?: boolean;
    showSetStatsExt?: boolean;
    showMatchStatsExt?: boolean;
    showPointEvolution?: boolean;
    showTopPlayersExt?: boolean;
    showWinPrediction?: boolean;
    showReceiverAccuracy?: boolean;
  };
}

export interface RequestItem {
  id: string;
  teamId: string;
  type: 'timeout' | 'substitution';
  subDetails?: {
    playerOutId: string;
    playerInId: string;
  };
  status: 'pending' | 'approved' | 'rejected';
}

export type UserRole = 'ADMIN' | 'COACH_A' | 'COACH_B' | 'PLAYER' | 'VIEWER' | 'REFEREE' | 'MAIN_REFEREE';

export interface User {
  id: string;
  username: string;
  password?: string; // For demo purposes only
  role: UserRole;
  createdBy?: string; // ID of the user who created this user (Hierarchy)
  linkedPlayerId?: string; // If the user is a player, this links to their player data
  linkedTeamId?: string; // If coach
}
