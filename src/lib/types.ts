export type Color = 'w' | 'b';
export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily' | 'classical' | 'unknown';
export type UserResult = 'win' | 'loss' | 'draw';

/** A game as stored locally. Summary fields are denormalised so lists render without parsing PGN. */
export interface StoredGame {
  id: string;
  source: 'chesscom' | 'pgn';
  url?: string;
  pgn: string;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  /** Which side the app user played, if known. */
  userColor: Color | null;
  result: string;
  userResult: UserResult | null;
  /** Human readable termination, e.g. "felix won on time". */
  termination: string;
  /** How the game ended from chess.com's result codes (timeout, resigned, checkmated, ...). */
  endReason: string;
  endTime: number;
  timeClass: TimeClass;
  timeControl: string;
  rated: boolean;
  eco?: string;
  openingName?: string;
  plyCount: number;
  analysisStatus: 'pending' | 'done' | 'error';
  analysisDepth?: number;
  /** The user's accuracy once analysed. */
  userAccuracy?: number;
  opponentAccuracy?: number;
  addedAt: number;
  /** When the user last opened this game's review (for "new games to review"). */
  reviewedAt?: number;
}

/** Engine score from White's point of view. `over` is a finished game: 1 white won, -1 black won, 0 draw. */
export type Score =
  | { kind: 'cp'; v: number }
  | { kind: 'mate'; v: number }
  | { kind: 'over'; v: 1 | 0 | -1 };

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'forced'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

export type Phase = 'opening' | 'middlegame' | 'endgame';

export type Motif =
  | 'hung_piece'
  | 'allowed_mate'
  | 'back_rank'
  | 'allowed_fork'
  | 'allowed_tactic'
  | 'missed_mate'
  | 'missed_win'
  | 'ignored_threat'
  | 'threw_advantage'
  | 'king_safety'
  | 'positional'
  | 'time_trouble'
  | 'rushed'
  | 'long_think';

export interface EngineLine {
  score: Score;
  pv: string[]; // uci moves
}

export interface PositionEval {
  fen: string;
  depth: number;
  lines: EngineLine[]; // best first; up to 2
}

export interface MoveAnalysis {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: Score;
  evalAfter: Score;
  bestUci?: string;
  bestSan?: string;
  /** Best line from the position before the move, in SAN. */
  bestLineSan: string[];
  bestLineUci: string[];
  /** Opponent's best reply line after the move, in SAN. */
  replyLineSan: string[];
  /** Win % (0-100) from the mover's point of view. */
  winBefore: number;
  winAfter: number;
  winLoss: number;
  accuracy: number;
  classification: Classification;
  motifs: Motif[];
  explanation: string;
  phase: Phase;
  isBook: boolean;
  clock?: number;
  timeSpent?: number;
}

export interface GameAnalysis {
  gameId: string;
  depth: number;
  createdAt: number;
  moves: MoveAnalysis[];
  accuracy: { w: number; b: number };
  /** Accuracy per phase for each side, undefined if the phase had no moves. */
  phaseAccuracy: Record<Color, Partial<Record<Phase, number>>>;
  /** White-POV evals for every position including the start. */
  evals: Score[];
}

export interface Puzzle {
  /** positionKey + '|' + played uci, so the same repeated error collapses into one puzzle. */
  id: string;
  fen: string;
  gameIds: string[];
  plies: number[];
  playedUci: string;
  playedSan: string;
  /** Why the game move was wrong (from the analysis). */
  explanation?: string;
  solutionUci: string[];
  classification: Classification;
  motifs: Motif[];
  phase: Phase;
  opening?: string;
  winLoss: number;
  /** Mover's win % with the best move, used to accept equally good alternatives. */
  bestWin: number;
  occurrences: number;
  createdAt: number;
  // SM-2 scheduling
  due: number;
  interval: number; // days
  ease: number;
  reps: number;
  lapses: number;
  lastResult?: 'solved' | 'failed';
}

export interface Settings {
  username: string;
  depth: number;
  autoAnalyze: boolean;
  /** How many of the most recent games the background queue analyses automatically. */
  autoAnalyzeLimit: number;
  /** Months of history to import on the first sync (0 = everything). */
  historyMonths: number;
  theme: 'system' | 'light' | 'dark';
  /** How many engine workers analyse in parallel (see workerCount). */
  analysisSpeed: 'light' | 'balanced' | 'max';
  /** Move to the next puzzle automatically after solving one. */
  autoNextPuzzle: boolean;
  sounds: boolean;
  boardTheme: BoardTheme;
  showCoordinates: boolean;
}

export type BoardTheme = 'green' | 'brown' | 'blue' | 'gray';

export const DEFAULT_SETTINGS: Settings = {
  username: '',
  depth: 14,
  autoAnalyze: true,
  autoAnalyzeLimit: 150,
  historyMonths: 6,
  theme: 'system',
  analysisSpeed: 'balanced',
  autoNextPuzzle: true,
  sounds: true,
  boardTheme: 'green',
  showCoordinates: true,
};
