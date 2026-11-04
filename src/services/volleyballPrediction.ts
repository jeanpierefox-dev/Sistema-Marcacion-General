import { PointLog } from '../types';

export interface PredictionInput {
  scoreA: number;
  scoreB: number;
  currentSet: number;
  maxSets?: number;
  pointsPerSet?: number;
  tieBreakPoints?: number;
  servingTeamId?: string | null;
  teamAId?: string;
  teamBId?: string;
  history?: PointLog[];
}

export interface SetProbabilityHistoryItem {
  probA: number;
  probB: number;
  scoreA: number;
  scoreB: number;
}

export interface SetProbabilityResult {
  probA: number;
  probB: number;
  targetScore: number;
  pointsNeededA: number;
  pointsNeededB: number;
  status: 'playing' | 'set_point_A' | 'set_point_B' | 'won_A' | 'won_B';
  servingAdvantage: 'A' | 'B' | 'none';
  momentum: 'A' | 'B' | 'neutral';
  streakA: number;
  streakB: number;
  historyProbabilities: SetProbabilityHistoryItem[];
}

/**
 * Calculates win probability for team A and team B in the current volleyball set.
 */
export function calculateSetWinProbability(input: PredictionInput): SetProbabilityResult {
  const {
    scoreA = 0,
    scoreB = 0,
    currentSet = 1,
    maxSets = 5,
    pointsPerSet = 25,
    tieBreakPoints = 15,
    servingTeamId,
    teamAId,
    teamBId,
    history = []
  } = input;

  const isTieBreak = currentSet >= maxSets;
  const baseTarget = isTieBreak ? tieBreakPoints : pointsPerSet;

  // Determine dynamic target score (taking deuce into account)
  let targetScore = baseTarget;
  if (scoreA >= baseTarget - 1 && scoreB >= baseTarget - 1) {
    targetScore = Math.max(scoreA, scoreB) + (Math.abs(scoreA - scoreB) >= 2 ? 0 : (2 - Math.abs(scoreA - scoreB)));
  }

  const pointsNeededA = Math.max(0, Math.max(targetScore, scoreB + 2) - scoreA);
  const pointsNeededB = Math.max(0, Math.max(targetScore, scoreA + 2) - scoreB);

  // Status
  let status: 'playing' | 'set_point_A' | 'set_point_B' | 'won_A' | 'won_B' = 'playing';
  if (scoreA >= baseTarget && scoreA - scoreB >= 2) {
    status = 'won_A';
  } else if (scoreB >= baseTarget && scoreB - scoreA >= 2) {
    status = 'won_B';
  } else if (pointsNeededA === 1 && pointsNeededB > 1) {
    status = 'set_point_A';
  } else if (pointsNeededB === 1 && pointsNeededA > 1) {
    status = 'set_point_B';
  }

  // Calculate current point streaks for team A and team B
  let streakA = 0;
  let streakB = 0;
  const scoringLogs = history.filter(h => h.type !== 'yellow_card');
  for (let i = scoringLogs.length - 1; i >= 0; i--) {
    const log = scoringLogs[i];
    if (log.teamId === teamAId) {
      if (streakB > 0) break;
      streakA++;
    } else if (log.teamId === teamBId) {
      if (streakA > 0) break;
      streakB++;
    }
  }

  // Momentum based on recent points & streak
  let momentum: 'A' | 'B' | 'neutral' = 'neutral';
  if (streakA >= 2) {
    momentum = 'A';
  } else if (streakB >= 2) {
    momentum = 'B';
  } else if (history.length > 0) {
    const recent = history.slice(-5);
    const recentA = recent.filter(h => h.teamId === teamAId).length;
    const recentB = recent.filter(h => h.teamId === teamBId).length;
    if (recentA >= 4 || (recent.length >= 3 && recentA - recentB >= 2)) {
      momentum = 'A';
    } else if (recentB >= 4 || (recent.length >= 3 && recentB - recentA >= 2)) {
      momentum = 'B';
    }
  }

  // Serving advantage
  let servingAdvantage: 'A' | 'B' | 'none' = 'none';
  if (servingTeamId && teamAId && servingTeamId === teamAId) {
    servingAdvantage = 'A';
  } else if (servingTeamId && teamBId && servingTeamId === teamBId) {
    servingAdvantage = 'B';
  }

  // Probability estimation function based on current score
  const computeProb = (sA: number, sB: number, srvAdv: 'A' | 'B' | 'none', mom: 'A' | 'B' | 'neutral'): number => {
    if (sA >= baseTarget && sA - sB >= 2) return 100;
    if (sB >= baseTarget && sB - sA >= 2) return 0;

    const diff = sA - sB;
    const remA = Math.max(1, Math.max(baseTarget, sB + 2) - sA);
    const remB = Math.max(1, Math.max(baseTarget, sA + 2) - sB);

    // Logistic base probability
    const totalPlayed = sA + sB;
    const progressFactor = Math.min(2.5, 1 + totalPlayed / (baseTarget * 1.5));
    let logOdds = (diff * 0.22) * progressFactor;

    // Remaining points ratio factor
    const ratioWeight = (remB - remA) * 0.15;
    logOdds += ratioWeight;

    // Serving factor
    if (srvAdv === 'A') logOdds += 0.15;
    if (srvAdv === 'B') logOdds -= 0.15;

    // Momentum factor
    if (mom === 'A') logOdds += 0.2;
    if (mom === 'B') logOdds -= 0.2;

    const prob = 1 / (1 + Math.exp(-logOdds));
    let probA = Math.round(prob * 100);

    // Clamp bounds unless set won
    probA = Math.max(1, Math.min(99, probA));
    return probA;
  };

  const probA = computeProb(scoreA, scoreB, servingAdvantage, momentum);
  const probB = 100 - probA;

  // Build point-by-point history probabilities for SVG graphs
  const historyProbabilities: SetProbabilityHistoryItem[] = [
    { probA: 50, probB: 50, scoreA: 0, scoreB: 0 }
  ];

  let runningA = 0;
  let runningB = 0;

  for (const point of history) {
    if (point.teamId === teamAId) {
      runningA++;
    } else if (point.teamId === teamBId) {
      runningB++;
    }
    const stepProbA = computeProb(runningA, runningB, 'none', 'neutral');
    historyProbabilities.push({
      probA: stepProbA,
      probB: 100 - stepProbA,
      scoreA: runningA,
      scoreB: runningB
    });
  }

  // Ensure current score matches the end of history if history didn't cover all points
  if (historyProbabilities[historyProbabilities.length - 1].scoreA !== scoreA ||
      historyProbabilities[historyProbabilities.length - 1].scoreB !== scoreB) {
    historyProbabilities.push({
      probA,
      probB,
      scoreA,
      scoreB
    });
  }

  return {
    probA,
    probB,
    targetScore,
    pointsNeededA,
    pointsNeededB,
    status,
    servingAdvantage,
    momentum,
    streakA,
    streakB,
    historyProbabilities
  };
}
