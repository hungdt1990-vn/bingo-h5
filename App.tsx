// tslint:disable
/* eslint-disable */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  Award,
  Clock,
  Crown,
  HelpCircle,
  Info,
  Menu,
  Play,
  Plus,
  Radio,
  RotateCw,
  Sparkles,
  Star,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {getConfig} from './constants';
import {SpriteRenderer, SpriteAnimationState} from './SpriteRenderer';
import BackgroundMusic from './utils/BackgroundMusic';
import {
  createFixedStepper,
  drawAsset,
  drawBackground,
  formatTime,
  gameAudio,
  GameState,
  MenuOverlay,
  prepareCanvas,
  shuffle,
  useAssets,
  useAutoFocus,
  useInput,
  useIsMobile,
} from './utils/helper';
import {
  usePlayground,
  usePlaygroundGameLifecycle,
  useRpc,
} from './utils/usePlayground';

// Assets Manifest
const ASSETS_MANIFEST: Record<string, string> = {
  bg_bingo_hall: 'assets/images/bg_bingo_hall.png',
  bingo_ball_gold: 'assets/images/bingo_ball_gold.png',
  bingo_shout_badge: 'assets/images/bingo_shout_badge.png',
  dauber_stamp_star: 'assets/images/dauber_stamp_star.png',
  trophy_winner_cup: 'assets/images/trophy_winner_cup.png',
  caller_host_idle: 'assets/images/caller_host_idle.png',
  caller_host_attack: 'assets/images/caller_host_attack.png',
  caller_host_dizzy: 'assets/images/caller_host_dizzy.png',
};

const BACKGROUND_MUSIC_URL = 'assets/audio/bgm_bingo_hall.mp3';

// Diverse, authentic international names (no 'Bot' prefix)
const INTERNATIONAL_NAMES = [
  'Mai Linh', 'Liam Smith', 'Haruto Sato', 'Camille Laurent', 'Mateo Rodriguez',
  'Min-jun Kim', 'Sophie Moreau', 'Lucas Dubois', 'Chiara Rossi', 'Ananya Sharma',
  'Gabriel Silva', 'Yuki Tanaka', 'Elena Vance', 'Santiago Gomez', 'Astrid Lind',
  'Minh Tuấn', 'Charlotte Brown', 'Kenji Takahashi', 'Valentina Diaz', 'Felix Weber',
  'Hương Giang', 'Oliver Wilson', 'Ji-woo Park', 'Amara Diallo', 'Leonardo Conti',
  'Bảo Nam', 'Emma Watson', 'Larissa Santos', 'Aarav Patel', 'Fatima Al-Mansoor',
  'Đức Anh', 'Ren Kobayashi', 'Mia Schneider', 'Felipe Costa', 'Priya Nair',
  'Thu Trang', 'Antoine Martin', 'Seo-yeon Lee', 'Tariq Aziz', 'Freja Olsen'
];

export interface BingoCell {
  col: number; // 0:B, 1:I, 2:N, 3:G, 4:O
  row: number; // 0..4
  number: number;
  isFree: boolean;
  daubed: boolean;
  daubTime?: number;
  animScale?: number;
  isLuckyInstant?: boolean; // Special Golden Lucky Star / Crown Instant BINGO cell
}

export interface BingoCard {
  id: number;
  grid: BingoCell[][]; // 5x5
  completedLines: number; // count of completed lines
  readyLineCount: number; // lines with 4/5 marked
  hasClaimedBingo: boolean;
  claimedRank?: number;
  claimedTime?: number;
}

export interface BotPlayer {
  id: number;
  name: string;
  avatarColor: string;
  reactionSpeed: number; // ms delay
  missRate: number; // small human error rate (e.g. 5%)
  cards: BingoCard[];
  hasWon: boolean;
  rank?: number;
  totalDaubs: number;
  minRemainingToLine: number; // 1 means "1 to go"
}

export interface BotActionQueueItem {
  botId: number;
  numberCalled: number;
  executeTime: number; // timestamp in seconds
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  isPlayer: boolean;
  timeSeconds: number;
  lineCount: number;
}

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

// Letter ranges for standard 75-ball bingo
export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;
export type BingoLetter = typeof BINGO_LETTERS[number];

export const LETTER_RANGES: Record<BingoLetter, [number, number]> = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
};

export const LETTER_THEMES: Record<BingoLetter, {
  pillBg: string;
  textColor: string;
  borderColor: string;
  glowColor: string;
  badgeBg: string;
}> = {
  B: {
    pillBg: 'bg-red-500 text-white',
    textColor: 'text-red-400',
    borderColor: 'border-red-500',
    glowColor: 'shadow-red-500/50',
    badgeBg: 'bg-gradient-to-br from-red-500 to-rose-700',
  },
  I: {
    pillBg: 'bg-amber-500 text-black',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500',
    glowColor: 'shadow-amber-500/50',
    badgeBg: 'bg-gradient-to-br from-amber-400 to-orange-600',
  },
  N: {
    pillBg: 'bg-emerald-500 text-white',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500',
    glowColor: 'shadow-emerald-500/50',
    badgeBg: 'bg-gradient-to-br from-emerald-400 to-teal-700',
  },
  G: {
    pillBg: 'bg-blue-500 text-white',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500',
    glowColor: 'shadow-blue-500/50',
    badgeBg: 'bg-gradient-to-br from-blue-500 to-indigo-700',
  },
  O: {
    pillBg: 'bg-purple-500 text-white',
    textColor: 'text-purple-400',
    borderColor: 'border-purple-500',
    glowColor: 'shadow-purple-500/50',
    badgeBg: 'bg-gradient-to-br from-purple-500 to-fuchsia-700',
  },
};

export function getLetterForNumber(num: number): BingoLetter {
  if (num <= 15) return 'B';
  if (num <= 30) return 'I';
  if (num <= 45) return 'N';
  if (num <= 60) return 'G';
  return 'O';
}

// Female English Caller Speech Synthesizer Helper
let cachedFemaleVoice: SpeechSynthesisVoice | null = null;

export function getFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const voice =
    voices.find((v) => {
      const name = v.name.toLowerCase();
      const isEn = v.lang.toLowerCase().startsWith('en');
      return (
        isEn &&
        (name.includes('female') ||
          name.includes('samantha') ||
          name.includes('victoria') ||
          name.includes('zira') ||
          name.includes('karen') ||
          name.includes('moira') ||
          name.includes('serena') ||
          name.includes('ava') ||
          name.includes('susan') ||
          name.includes('google us english') ||
          name.includes('google uk english female'))
      );
    }) ||
    voices.find((v) => v.lang.toLowerCase().startsWith('en-us') || v.lang.toLowerCase().startsWith('en-gb')) ||
    voices.find((v) => v.lang.toLowerCase().startsWith('en'));

  cachedFemaleVoice = voice || null;
  return cachedFemaleVoice;
}

export function speakCallerNumber(letter: string, num: number, enabled: boolean) {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const text = `${letter} ${num}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.15;
    utterance.volume = 1.0;

    const voice = cachedFemaleVoice || getFemaleVoice();
    if (voice) {
      utterance.voice = voice;
    }
    window.speechSynthesis.speak(utterance);
  } catch {
    // Non-blocking fallback
  }
}

function generateBingoCard(id: number): BingoCard {
  const grid: BingoCell[][] = [];

  const colsData: number[][] = [];
  for (let c = 0; c < 5; c++) {
    const letter = BINGO_LETTERS[c];
    const [min, max] = LETTER_RANGES[letter];
    const pool: number[] = [];
    for (let n = min; n <= max; n++) pool.push(n);
    const shuffled = shuffle(pool);
    colsData.push(shuffled.slice(0, 5));
  }

  for (let r = 0; r < 5; r++) {
    const row: BingoCell[] = [];
    for (let c = 0; c < 5; c++) {
      const isFree = r === 2 && c === 2;
      row.push({
        col: c,
        row: r,
        number: isFree ? 0 : colsData[c][r],
        isFree,
        daubed: isFree,
      });
    }
    grid.push(row);
  }

  return {
    id,
    grid,
    completedLines: 0,
    readyLineCount: 0,
    hasClaimedBingo: false,
  };
}

function checkCardLines(card: BingoCard): {
  lines: number;
  readyLines: number;
  minRemaining: number;
  readyCells: Set<string>;
} {
  let lines = 0;
  let readyLines = 0;
  let minRemaining = 5;
  const readyCells = new Set<string>();

  const processLine = (unDaubed: {r: number; c: number}[], count: number) => {
    const remaining = 5 - count;
    if (remaining < minRemaining) minRemaining = remaining;
    if (count === 5) {
      lines++;
    } else if (count === 4) {
      readyLines++;
      unDaubed.forEach((cell) => readyCells.add(`${cell.r},${cell.c}`));
    }
  };

  // Check 5 rows
  for (let r = 0; r < 5; r++) {
    let count = 0;
    const unDaubed: {r: number; c: number}[] = [];
    for (let c = 0; c < 5; c++) {
      if (card.grid[r][c].daubed) count++;
      else unDaubed.push({r, c});
    }
    processLine(unDaubed, count);
  }

  // Check 5 cols
  for (let c = 0; c < 5; c++) {
    let count = 0;
    const unDaubed: {r: number; c: number}[] = [];
    for (let r = 0; r < 5; r++) {
      if (card.grid[r][c].daubed) count++;
      else unDaubed.push({r, c});
    }
    processLine(unDaubed, count);
  }

  // Check main diagonal
  let d1Count = 0;
  const d1UnDaubed: {r: number; c: number}[] = [];
  for (let i = 0; i < 5; i++) {
    if (card.grid[i][i].daubed) d1Count++;
    else d1UnDaubed.push({r: i, c: i});
  }
  processLine(d1UnDaubed, d1Count);

  // Check anti diagonal
  let d2Count = 0;
  const d2UnDaubed: {r: number; c: number}[] = [];
  for (let i = 0; i < 5; i++) {
    if (card.grid[i][4 - i].daubed) d2Count++;
    else d2UnDaubed.push({r: i, c: 4 - i});
  }
  processLine(d2UnDaubed, d2Count);

  if (lines > 0) minRemaining = 0;

  return {lines, readyLines, minRemaining, readyCells};
}

export default function App() {
  const {sdk} = usePlayground();
  const [exitChat] = useRpc<Record<string, unknown>, void>('ExitChat');
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stepperRef = useRef<ReturnType<typeof createFixedStepper>>();

  // --- AUDIO & VOICE STATES ---
  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [isSfxMuted, setIsSfxMuted] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);

  // --- MENU / MODAL STATES ---
  const [isGameMenuOpen, setIsGameMenuOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [isMasterBoardOpen, setIsMasterBoardOpen] = useState(false); // LIVE Matrix Drawer (Does NOT Pause)
  const [inspectedBot, setInspectedBot] = useState<BotPlayer | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'winners' | 'bots'>('winners');

  // --- GAMEPLAY SETUP ---
  const [boardCount, setBoardCount] = useState<1 | 2 | 4>(2);
  const [activeBoardIndex, setActiveBoardIndex] = useState<number>(0);

  // --- POWER-UP & HELPER INVENTORY (Persists across sessions/rounds) ---
  const [autoPlayBank, setAutoPlayBank] = useState<number>(600); // 10 minutes = 600s
  const [isAutoPlayActive, setIsAutoPlayActive] = useState<boolean>(false);
  const [scanTickets, setScanTickets] = useState<number>(5);
  const [daub1Tickets, setDaub1Tickets] = useState<number>(3);
  const [daub2Tickets, setDaub2Tickets] = useState<number>(2);
  const [daub3Tickets, setDaub3Tickets] = useState<number>(1);
  const [instantBingoTickets, setInstantBingoTickets] = useState<number>(2);
  const [isScanningVisual, setIsScanningVisual] = useState<boolean>(false);

  // Refs for real-time simulation access
  const autoPlayBankRef = useRef<number>(600);
  const isAutoPlayActiveRef = useRef<boolean>(false);
  isAutoPlayActiveRef.current = isAutoPlayActive;

  // --- GAME STATE ---
  const [gameState, setGameState] = useState<GameState>({
    status: 'START',
    score: 0,
    level: 1,
    timer: 0,
    linesClaimed: 0,
    playerRank: null,
    totalPrizeSlots: getConfig('totalPrizeSlots'),
  });

  usePlaygroundGameLifecycle(gameState, sdk);

  const {assets, isReady: assetsReady} = useAssets(ASSETS_MANIFEST);

  const canvasWidth = getConfig('baseCanvasWidth') as number;
  const canvasHeight = getConfig('baseCanvasHeight') as number;

  if (!stepperRef.current) {
    const stepMs = getConfig('stepMs');
    const maxSubSteps = getConfig('maxSubSteps');
    stepperRef.current = createFixedStepper(stepMs, maxSubSteps);
  }

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // --- SIMULATION REFS ---
  const playerCardsRef = useRef<BingoCard[]>([]);
  const botsRef = useRef<BotPlayer[]>([]);
  const botQueueRef = useRef<BotActionQueueItem[]>([]);
  const calledNumbersRef = useRef<number[]>([]);
  const ballDeckRef = useRef<number[]>([]);
  const currentBallRef = useRef<number | null>(null);
  const currentBallTimeRef = useRef<number>(0);
  const callTimerRef = useRef<number>(0);
  const totalSlotsRemainingRef = useRef<number>(25);
  const leaderboardRef = useRef<LeaderboardEntry[]>([]);
  const tickerMessagesRef = useRef<{id: number; text: string; time: number}[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const hasWonRef = useRef<boolean>(false);
  const isVoiceMutedRef = useRef(isVoiceMuted);
  isVoiceMutedRef.current = isVoiceMuted;

  // Caller Host Animation State
  const callerSpriteRendererRef = useRef<SpriteRenderer | null>(null);
  const callerAnimStateRef = useRef<SpriteAnimationState>({
    currentAction: 'IDLE',
    currentFrame: 0,
    timer: 0,
  });

  // UI Reactive States
  const [playerCards, setPlayerCards] = useState<BingoCard[]>([]);
  const [botsState, setBotsState] = useState<BotPlayer[]>([]);
  const [currentBall, setCurrentBall] = useState<number | null>(null);
  const [recentBalls, setRecentBalls] = useState<number[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [slotsRemaining, setSlotsRemaining] = useState<number>(25);
  const [tickerMessages, setTickerMessages] = useState<{id: number; text: string}[]>([]);
  const [hasValidBingo, setHasValidBingo] = useState(false);

  // Input Handling
  const inputRef = useInput(canvasRef, true, {
    width: canvasWidth,
    height: canvasHeight,
  });
  const lastCancelRef = useRef(false);
  const lastSpaceRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      getFemaleVoice();
      window.speechSynthesis.onvoiceschanged = () => {
        getFemaleVoice();
      };
    }
  }, []);

  useEffect(() => {
    if (!callerSpriteRendererRef.current) {
      callerSpriteRendererRef.current = new SpriteRenderer({
        IDLE: {
          imageUrl: 'caller_host_idle',
          totalFrames: 4,
          frameWidth: 512,
          frameHeight: 512,
          fps: 8,
          loop: true,
        },
        ATTACK: {
          imageUrl: 'caller_host_attack',
          totalFrames: 16,
          frameWidth: 512,
          frameHeight: 512,
          fps: 16,
          loop: false,
        },
        DIZZY: {
          imageUrl: 'caller_host_dizzy',
          totalFrames: 16,
          frameWidth: 512,
          frameHeight: 512,
          fps: 8,
          loop: true,
        },
      });
    }
  }, []);

  useEffect(() => {
    (window as any).canHandleBackKey = gameState.status !== 'START';
  }, [gameState.status]);

  useEffect(() => {
    if (gameState.status === 'GAME_OVER') {
      gameAudio.playDefeatMotif();
    } else if (gameState.status === 'VICTORY') {
      gameAudio.playVictoryFanfare();
    }
  }, [gameState.status]);

  // --- SPAWN PARTICLES & JUICE ---
  const spawnConfetti = (count = 60, originX = canvasWidth / 2, originY = canvasHeight / 2) => {
    const colors = ['#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#fbbf24', '#8b5cf6', '#ef4444'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 200 + Math.random() * 450;
      particlesRef.current.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 150,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 5 + Math.random() * 8,
        alpha: 1,
        life: 0,
        maxLife: 1.2 + Math.random() * 1.5,
      });
    }
  };

  const addFloatingText = (text: string, x: number, y: number, color = '#fbbf24') => {
    floatingTextsRef.current.push({
      id: Date.now() + Math.random(),
      text,
      x,
      y,
      color,
      life: 0,
      maxLife: 1.4,
    });
  };

  const pushTicker = (text: string) => {
    const item = {id: Date.now() + Math.random(), text, time: gameStateRef.current.timer || 0};
    tickerMessagesRef.current = [item, ...tickerMessagesRef.current.slice(0, 5)];
    setTickerMessages([...tickerMessagesRef.current]);
  };

  // --- START / RESET GAME ---
  const initGame = useCallback(() => {
    const newPlayerCards: BingoCard[] = [];
    for (let i = 0; i < boardCount; i++) {
      newPlayerCards.push(generateBingoCard(i + 1));
    }
    playerCardsRef.current = newPlayerCards;
    setPlayerCards(newPlayerCards);
    setActiveBoardIndex(0);

    const numBots = getConfig('totalBots') as number;
    const botColors = ['#f43f5e', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#3b82f6'];
    const shuffledNames = shuffle(INTERNATIONAL_NAMES);
    const newBots: BotPlayer[] = [];
    for (let b = 0; b < numBots; b++) {
      const name = shuffledNames[b % shuffledNames.length] || `Contestant ${b + 1}`;
      const botCards: BingoCard[] = [];
      for (let c = 0; c < boardCount; c++) {
        botCards.push(generateBingoCard(c + 1));
      }
      newBots.push({
        id: b + 1,
        name,
        avatarColor: botColors[b % botColors.length],
        reactionSpeed: 0.4 + Math.random() * 1.6,
        missRate: 0.03 + Math.random() * 0.06,
        cards: botCards,
        hasWon: false,
        totalDaubs: 0,
        minRemainingToLine: 5,
      });
    }
    botsRef.current = newBots;
    setBotsState(newBots);
    botQueueRef.current = [];

    const allNumbers: number[] = [];
    for (let i = 1; i <= 75; i++) allNumbers.push(i);
    ballDeckRef.current = shuffle(allNumbers);
    calledNumbersRef.current = [];
    currentBallRef.current = null;
    currentBallTimeRef.current = 0;
    callTimerRef.current = 0.5;

    const prizeSlots = getConfig('totalPrizeSlots') as number;
    totalSlotsRemainingRef.current = prizeSlots;
    setSlotsRemaining(prizeSlots);
    leaderboardRef.current = [];
    setLeaderboard([]);
    tickerMessagesRef.current = [];
    setTickerMessages([]);
    particlesRef.current = [];
    floatingTextsRef.current = [];
    hasWonRef.current = false;
    setHasValidBingo(false);
    setInspectedBot(null);

    callerAnimStateRef.current = {
      currentAction: 'IDLE',
      currentFrame: 0,
      timer: 0,
    };

    setGameState({
      status: 'PLAYING',
      score: 0,
      level: boardCount,
      timer: 0,
      linesClaimed: 0,
      playerRank: null,
      totalPrizeSlots: prizeSlots,
    });

    gameAudio.playConfirmSelect();

    if (sdk) {
      sdk.startGame();
    }
  }, [boardCount, sdk]);

  // Auto-start support for automated screenshot testing
  const hasAutoplayed = useRef(false);
  useEffect(() => {
    if (
      !hasAutoplayed.current &&
      new URLSearchParams(window.location.search).has('autoplay')
    ) {
      hasAutoplayed.current = true;
      initGame();
    }
  }, [initGame]);

  // --- CLAIM PLAYER BINGO ---
  const handleClaimBingo = useCallback(() => {
    if (gameStateRef.current.status !== 'PLAYING') return;

    const eligibleCards = playerCardsRef.current.filter((card) => {
      if (card.hasClaimedBingo) return false;
      const {lines} = checkCardLines(card);
      return lines > 0;
    });

    if (eligibleCards.length > 0 && totalSlotsRemainingRef.current > 0) {
      let earnedPoints = 0;
      let highestRank = 999;
      let totalClaimedNow = 0;

      eligibleCards.forEach((card) => {
        if (totalSlotsRemainingRef.current <= 0) return;

        const {lines} = checkCardLines(card);
        card.hasClaimedBingo = true;
        card.completedLines = lines;

        const rank = leaderboardRef.current.length + 1;
        card.claimedRank = rank;
        card.claimedTime = gameStateRef.current.timer || 0;
        if (rank < highestRank) highestRank = rank;
        totalClaimedNow++;

        totalSlotsRemainingRef.current -= 1;

        const rankBonus = Math.max(0, (26 - rank) * 500);
        const lineBonus = lines * 1000;
        earnedPoints += rankBonus + lineBonus;

        const cardName = boardCount > 1 ? `YOU (Card #${card.id})` : 'YOU (Player)';
        const entry: LeaderboardEntry = {
          rank,
          name: cardName,
          isPlayer: true,
          timeSeconds: gameStateRef.current.timer || 0,
          lineCount: lines,
        };
        leaderboardRef.current.push(entry);

        const suffix = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
        pushTicker(`🎉 ${cardName} claimed ${suffix} Place! (${totalSlotsRemainingRef.current} prize slots left)`);
      });

      setSlotsRemaining(totalSlotsRemainingRef.current);
      setLeaderboard([...leaderboardRef.current]);
      setPlayerCards([...playerCardsRef.current]);

      const remainingUnclaimedBingo = playerCardsRef.current.some(
        (cd) => !cd.hasClaimedBingo && checkCardLines(cd).lines > 0,
      );
      setHasValidBingo(remainingUnclaimedBingo);

      gameAudio.playLevelUpStinger();
      spawnConfetti(140, canvasWidth / 2, canvasHeight / 2);
      addFloatingText(`BINGO! #${highestRank} PLACE! +${earnedPoints} PTS`, canvasWidth / 2, canvasHeight / 2, '#10b981');

      const allPlayerCardsFinished = playerCardsRef.current.every((c) => c.hasClaimedBingo);
      const totalClaimedCardsCount = playerCardsRef.current.filter((c) => c.hasClaimedBingo).length;

      if (!allPlayerCardsFinished) {
        const nextUnclaimedIdx = playerCardsRef.current.findIndex((c) => !c.hasClaimedBingo);
        if (nextUnclaimedIdx !== -1) {
          setActiveBoardIndex(nextUnclaimedIdx);
        }
      }

      setGameState((prev) => {
        const newScore = prev.score + earnedPoints;
        const isGameEnding = allPlayerCardsFinished || totalSlotsRemainingRef.current <= 0;
        return {
          ...prev,
          status: isGameEnding ? 'VICTORY' : 'PLAYING',
          score: newScore,
          playerRank: highestRank !== 999 ? highestRank : prev.playerRank,
          linesClaimed: totalClaimedCardsCount,
        };
      });

      if (allPlayerCardsFinished) {
        hasWonRef.current = true;
      }
    } else {
      gameAudio.playErrorBuzz();
      addFloatingText('NO NEW BINGO LINE! (-100 PTS)', canvasWidth / 2, canvasHeight / 2, '#ef4444');
      callerAnimStateRef.current = {
        currentAction: 'DIZZY',
        currentFrame: 0,
        timer: 0,
      };
      setGameState((prev) => ({
        ...prev,
        score: Math.max(0, prev.score - 100),
      }));
    }
  }, [boardCount, canvasHeight, canvasWidth]);

  // --- INTERNAL DAUB EXECUTION (Used by Click, Auto-Play, Scan, Boosters) ---
  const executeDaub = useCallback((
    cardIndex: number,
    r: number,
    c: number,
    source: 'manual' | 'autoplay' | 'scan' | 'booster' = 'manual',
  ) => {
    const card = playerCardsRef.current[cardIndex];
    if (!card || card.hasClaimedBingo) return;
    const cell = card.grid[r]?.[c];
    if (!cell || cell.daubed) return;

    cell.daubed = true;
    cell.daubTime = gameStateRef.current.timer;
    cell.animScale = 1.4;

    // Check if this was a Lucky Instant BINGO cell
    const isLuckyTriggered = !!cell.isLuckyInstant;
    if (isLuckyTriggered) {
      // Complete entire row to give instant full line
      card.grid[r].forEach((targetCell) => {
        targetCell.daubed = true;
      });
      gameAudio.playVictoryFanfare();
      spawnConfetti(80, canvasWidth / 2, canvasHeight / 2);
      addFloatingText('👑 INSTANT BINGO TRIGGERED! 🎉', canvasWidth / 2, canvasHeight / 2, '#fbbf24');
    }

    // Points calculation
    const isCurrentBall = currentBallRef.current === cell.number;
    const quickWindow = getConfig('quickDaubWindowSeconds') as number;
    const timeSinceBall = (gameStateRef.current.timer || 0) - currentBallTimeRef.current;
    const isQuick = source === 'manual' && isCurrentBall && timeSinceBall <= quickWindow;

    const basePts = getConfig('scoreCorrectDaub') as number;
    const quickBonus = isQuick ? (getConfig('scoreQuickBonus') as number) : 0;
    const instantBonus = isLuckyTriggered ? 500 : 0;
    const earnedScore = basePts + quickBonus + instantBonus;

    if (source === 'manual') {
      if (isQuick) {
        gameAudio.playPowerupChime();
        addFloatingText(`QUICK DAUB! +${earnedScore}`, 400, 300, '#fbbf24');
      } else {
        gameAudio.playCoinPickup();
        addFloatingText(`+${earnedScore}`, 400, 300, '#6ee7b7');
      }
    }

    setGameState((prev) => ({
      ...prev,
      score: prev.score + earnedScore,
    }));

    const {lines, readyLines} = checkCardLines(card);
    card.completedLines = lines;
    card.readyLineCount = readyLines;

    const anyUnclaimedBingo = playerCardsRef.current.some(
      (cd) => !cd.hasClaimedBingo && checkCardLines(cd).lines > 0,
    );
    setHasValidBingo(anyUnclaimedBingo);
    setPlayerCards([...playerCardsRef.current]);
  }, [canvasHeight, canvasWidth]);

  // --- PLAYER DAUB NUMBER CELL (Manual Click) ---
  const handleDaubCell = useCallback((cardIndex: number, r: number, c: number) => {
    if (gameStateRef.current.status !== 'PLAYING') return;
    const card = playerCardsRef.current[cardIndex];
    if (!card) return;
    const cell = card.grid[r]?.[c];
    if (!cell || cell.daubed) return;

    const wasCalled = calledNumbersRef.current.includes(cell.number);

    if (wasCalled || cell.isFree) {
      executeDaub(cardIndex, r, c, 'manual');
    } else {
      gameAudio.playErrorBuzz();
      addFloatingText('Not called yet!', 400, 300, '#f87171');
    }
  }, [executeDaub]);

  // --- POWER-UP: SCAN FEATURE (Missed Numbers Scanner) ---
  const handleUseScan = () => {
    if (gameState.status !== 'PLAYING') return;
    if (scanTickets <= 0) {
      gameAudio.playErrorBuzz();
      addFloatingText('No Scan tickets left!', canvasWidth / 2, canvasHeight / 2, '#f87171');
      return;
    }

    setScanTickets((prev) => prev - 1);
    setIsScanningVisual(true);
    setTimeout(() => setIsScanningVisual(false), 1200);

    gameAudio.playArcadeLaser();

    let missedCount = 0;
    playerCardsRef.current.forEach((card, cIdx) => {
      if (card.hasClaimedBingo) return;
      card.grid.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (!cell.daubed && calledNumbersRef.current.includes(cell.number)) {
            executeDaub(cIdx, r, c, 'scan');
            missedCount++;
          }
        });
      });
    });

    if (missedCount > 0) {
      gameAudio.playPowerupChime();
      spawnConfetti(50, canvasWidth / 2, canvasHeight / 2);
      addFloatingText(`📡 SCAN DAUBED ${missedCount} MISSED NUMBERS!`, canvasWidth / 2, canvasHeight / 2, '#38bdf8');
      pushTicker(`📡 Radar Scanner auto-recovered ${missedCount} missed numbers!`);
    } else {
      gameAudio.playHoverMicroTone();
      addFloatingText('📡 ALL NUMBERS ALREADY CAUGHT UP!', canvasWidth / 2, canvasHeight / 2, '#38bdf8');
    }
  };

  // --- POWER-UP: DAUB BOOSTERS (1-Daub, 2-Daub, 3-Daub) ---
  const handleUseDaubBooster = (count: 1 | 2 | 3) => {
    if (gameState.status !== 'PLAYING') return;

    if (count === 1 && daub1Tickets <= 0) {
      gameAudio.playErrorBuzz();
      addFloatingText('No 1-Daub tickets left!', canvasWidth / 2, canvasHeight / 2, '#f87171');
      return;
    }
    if (count === 2 && daub2Tickets <= 0) {
      gameAudio.playErrorBuzz();
      addFloatingText('No 2-Daub tickets left!', canvasWidth / 2, canvasHeight / 2, '#f87171');
      return;
    }
    if (count === 3 && daub3Tickets <= 0) {
      gameAudio.playErrorBuzz();
      addFloatingText('No 3-Daub tickets left!', canvasWidth / 2, canvasHeight / 2, '#f87171');
      return;
    }

    if (count === 1) setDaub1Tickets((prev) => prev - 1);
    if (count === 2) setDaub2Tickets((prev) => prev - 1);
    if (count === 3) setDaub3Tickets((prev) => prev - 1);

    gameAudio.playPowerupChime();
    let totalDaubed = 0;

    playerCardsRef.current.forEach((card, cIdx) => {
      if (card.hasClaimedBingo) return;
      const unDaubedCells: {r: number; c: number}[] = [];
      card.grid.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (!cell.daubed) unDaubedCells.push({r, c});
        });
      });

      const shuffledCells = shuffle(unDaubedCells);
      const chosen = shuffledCells.slice(0, count);
      chosen.forEach(({r, c}) => {
        executeDaub(cIdx, r, c, 'booster');
        totalDaubed++;
      });
    });

    spawnConfetti(40, canvasWidth / 2, canvasHeight / 2);
    addFloatingText(`⚡ +${count}-DAUB ACTIVATED! (+${totalDaubed} cells)`, canvasWidth / 2, canvasHeight / 2, '#c084fc');
    pushTicker(`⚡ Used ${count}-Daub Booster! Auto-stamped ${totalDaubed} cells!`);
  };

  // --- POWER-UP: INSTANT BINGO TARGET ITEM (Golden Crown Lucky Cell) ---
  const handleUseInstantBingo = () => {
    if (gameState.status !== 'PLAYING') return;
    if (instantBingoTickets <= 0) {
      gameAudio.playErrorBuzz();
      addFloatingText('No Instant Bingo tickets left!', canvasWidth / 2, canvasHeight / 2, '#f87171');
      return;
    }

    setInstantBingoTickets((prev) => prev - 1);
    gameAudio.playLevelUpStinger();
    spawnConfetti(70, canvasWidth / 2, canvasHeight / 2);

    let placedCount = 0;
    playerCardsRef.current.forEach((card) => {
      if (card.hasClaimedBingo) return;
      // Find un-daubed cells that are not already lucky
      const candidates: BingoCell[] = [];
      card.grid.forEach((row) => {
        row.forEach((cell) => {
          if (!cell.daubed && !cell.isLuckyInstant && !cell.isFree) {
            candidates.push(cell);
          }
        });
      });

      if (candidates.length > 0) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        picked.isLuckyInstant = true;
        placedCount++;
      }
    });

    setPlayerCards([...playerCardsRef.current]);
    addFloatingText('👑 GOLDEN LUCKY CELL PLACED! DAUB IT FOR INSTANT BINGO!', canvasWidth / 2, canvasHeight / 2, '#fbbf24');
    pushTicker('👑 Golden Lucky Target Cell placed! Daubing it triggers Instant BINGO!');
  };

  // Restock / Recharge Booster Pack Helper
  const handleRestockBoosters = () => {
    setAutoPlayBank((prev) => prev + 300); // +5 minutes
    setScanTickets((prev) => prev + 3);
    setDaub1Tickets((prev) => prev + 3);
    setDaub2Tickets((prev) => prev + 2);
    setDaub3Tickets((prev) => prev + 1);
    setInstantBingoTickets((prev) => prev + 1);
    gameAudio.playPowerupChime();
    addFloatingText('🎁 +BOOSTER RECHARGE PACK CLAIMED!', canvasWidth / 2, canvasHeight / 2, '#34d399');
  };

  // --- QUEUE AUTHENTIC BOT ACTIONS WHEN BALL DRAWN ---
  const scheduleBotDaubs = (numberCalled: number, currentTime: number) => {
    botsRef.current.forEach((bot) => {
      if (bot.hasWon) return;
      const jitter = (Math.random() - 0.5) * 0.4;
      const reactionDelay = Math.max(0.2, bot.reactionSpeed + jitter);
      botQueueRef.current.push({
        botId: bot.id,
        numberCalled,
        executeTime: currentTime + reactionDelay,
      });
    });
  };

  // --- PROCESS QUEUED BOT DAUBS ---
  const processBotActions = (currentTime: number) => {
    if (botQueueRef.current.length === 0) return;

    const remainingQueue: BotActionQueueItem[] = [];
    let stateChanged = false;

    botQueueRef.current.forEach((action) => {
      if (currentTime < action.executeTime) {
        remainingQueue.push(action);
        return;
      }

      const bot = botsRef.current.find((b) => b.id === action.botId);
      if (!bot || bot.hasWon) return;

      const misses = Math.random() < bot.missRate;
      let botDaubedAny = false;
      let minRemainingAcrossCards = 5;

      bot.cards.forEach((card) => {
        if (!misses) {
          card.grid.forEach((row) => {
            row.forEach((cell) => {
              if (cell.number === action.numberCalled && !cell.daubed) {
                cell.daubed = true;
                bot.totalDaubs += 1;
                botDaubedAny = true;
              }
            });
          });
        }

        const {lines, readyLines, minRemaining} = checkCardLines(card);
        card.completedLines = lines;
        card.readyLineCount = readyLines;
        if (minRemaining < minRemainingAcrossCards) {
          minRemainingAcrossCards = minRemaining;
        }

        if (lines > 0 && !bot.hasWon && totalSlotsRemainingRef.current > 0) {
          bot.hasWon = true;
          const rank = leaderboardRef.current.length + 1;
          bot.rank = rank;
          totalSlotsRemainingRef.current -= 1;
          setSlotsRemaining(totalSlotsRemainingRef.current);

          const entry: LeaderboardEntry = {
            rank,
            name: bot.name,
            isPlayer: false,
            timeSeconds: currentTime,
            lineCount: lines,
          };
          leaderboardRef.current.push(entry);
          setLeaderboard([...leaderboardRef.current]);

          const suffix = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
          pushTicker(`🏆 ${bot.name} yelled BINGO! Claimed ${suffix} Place! (${totalSlotsRemainingRef.current} slots left)`);

          if (totalSlotsRemainingRef.current <= 0) {
            const playerClaimedAny = playerCardsRef.current.some((c) => c.hasClaimedBingo);
            setGameState((prev) => ({
              ...prev,
              status: playerClaimedAny ? 'VICTORY' : 'GAME_OVER',
            }));
          }
        }
      });

      bot.minRemainingToLine = minRemainingAcrossCards;
      if (botDaubedAny) stateChanged = true;
    });

    botQueueRef.current = remainingQueue;
    if (stateChanged) {
      setBotsState([...botsRef.current]);
      if (inspectedBot) {
        const liveBot = botsRef.current.find((b) => b.id === inspectedBot.id);
        if (liveBot) setInspectedBot({...liveBot});
      }
    }
  };

  // --- UPDATE LOOP ---
  const update = (deltaTime: number) => {
    if (gameState.status !== 'PLAYING') return;

    // Update timer
    const newTimer = (gameStateRef.current.timer || 0) + deltaTime;
    setGameState((prev) => ({...prev, timer: newTimer}));

    // Auto-Play Real-Time Battery Countdown
    if (isAutoPlayActiveRef.current) {
      autoPlayBankRef.current = Math.max(0, autoPlayBankRef.current - deltaTime);
      setAutoPlayBank(autoPlayBankRef.current);

      if (autoPlayBankRef.current <= 0) {
        setIsAutoPlayActive(false);
        isAutoPlayActiveRef.current = false;
        gameAudio.playErrorBuzz();
        pushTicker('⚡ Auto-Play time pool depleted! Reverting to manual.');
        addFloatingText('⚡ AUTO-PLAY TIME DEPLETED!', canvasWidth / 2, canvasHeight / 2, '#f87171');
      }
    }

    // Process authentic bot action queue
    processBotActions(newTimer);

    // Update Caller Host Animation State
    if (callerSpriteRendererRef.current) {
      callerAnimStateRef.current = callerSpriteRendererRef.current.getNextState(
        callerAnimStateRef.current,
        deltaTime,
      );

      if (
        callerAnimStateRef.current.currentAction === 'ATTACK' &&
        callerAnimStateRef.current.currentFrame >= 15
      ) {
        callerAnimStateRef.current = {
          currentAction: 'IDLE',
          currentFrame: 0,
          timer: 0,
        };
      }
    }

    // Update Ball Drawing Timer
    const callInterval = getConfig('callIntervalSeconds') as number;
    callTimerRef.current += deltaTime;

    if (callTimerRef.current >= callInterval && ballDeckRef.current.length > 0) {
      callTimerRef.current = 0;
      const nextNum = ballDeckRef.current.pop();
      if (nextNum !== undefined) {
        currentBallRef.current = nextNum;
        currentBallTimeRef.current = newTimer;
        calledNumbersRef.current.push(nextNum);

        const letter = getLetterForNumber(nextNum);
        setCurrentBall(nextNum);
        setRecentBalls([...calledNumbersRef.current.slice(-5)]);

        // Realistic Female English Voice Announcer
        speakCallerNumber(letter, nextNum, !isVoiceMutedRef.current);

        // Animate Caller Host shouting number
        callerAnimStateRef.current = {
          currentAction: 'ATTACK',
          currentFrame: 0,
          timer: 0,
        };
        gameAudio.playCrispClick();

        // Queue Authentic Bot Daub Reactions
        scheduleBotDaubs(nextNum, newTimer);

        // AUTO-PLAY CRITICAL RULE:
        // Automatically daub matching number on active player cards ONLY for this newly called ball!
        // Does NOT retroactively daub past missed numbers!
        if (isAutoPlayActiveRef.current) {
          playerCardsRef.current.forEach((card, cIdx) => {
            if (card.hasClaimedBingo) return;
            card.grid.forEach((row, r) => {
              row.forEach((cell, c) => {
                if (cell.number === nextNum && !cell.daubed) {
                  executeDaub(cIdx, r, c, 'autoplay');
                }
              });
            });
          });
        }
      }
    }

    // Check ready lines for glowing assist
    const showReadyAssist = getConfig('readyLineHighlight');
    if (showReadyAssist) {
      playerCardsRef.current.forEach((card) => {
        const {readyCells} = checkCardLines(card);
        card.grid.forEach((row) => {
          row.forEach((cell) => {
            (cell as any).isReadyGlow = readyCells.has(`${cell.row},${cell.col}`);
          });
        });
      });
    }

    // Update Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.life += deltaTime;
      if (p.life >= p.maxLife) {
        particlesRef.current.splice(i, 1);
        continue;
      }
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vy += 400 * deltaTime;
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
    }

    // Update Floating Texts
    for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
      const ft = floatingTextsRef.current[i];
      ft.life += deltaTime;
      if (ft.life >= ft.maxLife) {
        floatingTextsRef.current.splice(i, 1);
        continue;
      }
      ft.y -= 45 * deltaTime;
    }

    // Space for BINGO
    if (inputRef.current) {
      const isSpace = inputRef.current.actions.confirm;
      if (isSpace && !lastSpaceRef.current) {
        handleClaimBingo();
      }
      lastSpaceRef.current = isSpace;
    }
  };

  // --- DRAW LOOP ---
  const draw = (ctx: CanvasRenderingContext2D) => {
    prepareCanvas(ctx, canvasWidth, canvasHeight);

    // Draw Bingo Hall Background
    drawBackground(
      ctx,
      assets['bg_bingo_hall'],
      canvasWidth,
      canvasHeight,
      '#1e1035',
    );

    // Draw Animated Caller Host (Sprite sheet) on stage left
    if (callerSpriteRendererRef.current && assetsReady) {
      const hostW = 200;
      const hostH = 200;
      const hostX = 30;
      const hostY = canvasHeight - hostH - 30;

      callerSpriteRendererRef.current.draw(
        ctx,
        callerAnimStateRef.current,
        hostX,
        hostY,
        hostW,
        hostH,
        assets,
      );
    }

    // Draw Particles & Confetti
    particlesRef.current.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw Floating Texts
    floatingTextsRef.current.forEach((ft) => {
      ctx.save();
      const alpha = Math.max(0, 1 - ft.life / ft.maxLife);
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillStyle = ft.color;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });
  };

  // Game Loop Ref Sync
  const updateRef = useRef(update);
  const drawRef = useRef(draw);
  updateRef.current = update;
  drawRef.current = draw;

  useEffect(() => {
    let raf = 0;
    const loop = (time: number) => {
      if (inputRef.current) {
        const cancelPressed = inputRef.current.actions.cancel;
        if (cancelPressed && !lastCancelRef.current) {
          const currentStatus = gameStateRef.current.status;
          if (currentStatus === 'PLAYING') {
            setIsGameMenuOpen((prev) => !prev);
          } else if (currentStatus === 'START') {
            void exitChat({});
          } else if (['GAME_OVER', 'VICTORY'].includes(currentStatus)) {
            setGameState((prev) => ({...prev, status: 'START'}));
          }
        }
        lastCancelRef.current = cancelPressed;
      }

      // CRITICAL: Master Board 1-75 viewing does NOT pause the game!
      if (!isGameMenuOpen && !isHowToPlayOpen && !inspectedBot) {
        stepperRef.current?.(time, (dt) => updateRef.current(dt));
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawRef.current(ctx);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [exitChat, inspectedBot, isGameMenuOpen, isHowToPlayOpen]);

  // Window key listener for 1, 2, 3, 4 tab selection & Space for Bingo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState.status !== 'PLAYING') return;
      if (e.key === '1') setActiveBoardIndex(0);
      else if (e.key === '2' && boardCount >= 2) setActiveBoardIndex(1);
      else if (e.key === '3' && boardCount >= 4) setActiveBoardIndex(2);
      else if (e.key === '4' && boardCount >= 4) setActiveBoardIndex(3);
      else if (e.code === 'Space') {
        e.preventDefault();
        handleClaimBingo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [boardCount, gameState.status, handleClaimBingo]);

  const isMusicPlaying = !['START', 'GAME_OVER', 'VICTORY'].includes(gameState.status) && !isMusicMuted;

  // Toggle Auto-Play Button Handler
  const toggleAutoPlay = () => {
    if (autoPlayBankRef.current <= 0 && !isAutoPlayActive) {
      gameAudio.playErrorBuzz();
      addFloatingText('Auto-Play time bank is empty! Click Restock to recharge.', canvasWidth / 2, canvasHeight / 2, '#f87171');
      return;
    }
    const nextState = !isAutoPlayActive;
    setIsAutoPlayActive(nextState);
    isAutoPlayActiveRef.current = nextState;
    if (nextState) {
      gameAudio.playPowerupChime();
      pushTicker('⚡ Auto-Play ON! New calls will be daubed automatically.');
      addFloatingText('⚡ AUTO-PLAY ACTIVATED!', canvasWidth / 2, canvasHeight / 2, '#38bdf8');
    } else {
      gameAudio.playConfirmSelect();
      pushTicker('⚡ Auto-Play paused.');
    }
  };

  // Render individual Bingo Card Component
  const renderCard = (card: BingoCard, cardIdx: number, compact = false, readOnly = false) => {
    const isSelected = !readOnly && activeBoardIndex === cardIdx;
    return (
      <div
        key={card.id}
        onClick={() => !readOnly && setActiveBoardIndex(cardIdx)}
        className={`relative bg-slate-900/95 backdrop-blur-md rounded-2xl border-2 transition-all p-2 sm:p-3 flex flex-col shadow-2xl overflow-hidden ${
          isSelected
            ? 'border-amber-400 ring-2 ring-amber-400/50'
            : card.hasClaimedBingo
            ? 'border-emerald-500/80 ring-1 ring-emerald-500/40'
            : readOnly
            ? 'border-slate-700'
            : 'border-slate-800 opacity-90 hover:opacity-100 cursor-pointer'
        } ${compact ? 'max-w-[280px] sm:max-w-[320px]' : 'max-w-[380px] sm:max-w-[420px]'} w-full`}>
        
        {/* Radar Scanner Visual Wave Overlay */}
        {isScanningVisual && !readOnly && (
          <div className="absolute inset-0 z-30 pointer-events-none bg-gradient-to-b from-transparent via-cyan-400/30 to-transparent animate-pulse border-y-2 border-cyan-400" />
        )}

        {/* Card Header */}
        <div className="flex items-center justify-between mb-1.5 px-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`font-black text-xs px-2 py-0.5 rounded-full ${
                card.hasClaimedBingo
                  ? 'bg-emerald-500 text-black'
                  : 'bg-amber-500 text-black'
              }`}>
              Card #{card.id}
            </span>
            {card.hasClaimedBingo ? (
              <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-[10px] sm:text-xs px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                <Trophy className="w-3 h-3 fill-slate-950" />
                {card.claimedRank === 1 ? '1st' : card.claimedRank === 2 ? '2nd' : card.claimedRank === 3 ? '3rd' : `#${card.claimedRank}`} Bingo!
              </span>
            ) : card.completedLines > 0 ? (
              <span className="bg-emerald-500 text-white font-bold text-[10px] sm:text-xs px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                <Star className="w-3 h-3 fill-white" />
                {card.completedLines} Line{card.completedLines > 1 ? 's' : ''} Ready!
              </span>
            ) : card.readyLineCount > 0 ? (
              <span className="bg-amber-400/20 text-amber-300 font-semibold text-[10px] px-1.5 py-0.5 rounded border border-amber-400/40 animate-pulse">
                🔥 1 to Go!
              </span>
            ) : null}
          </div>
          {!readOnly && (
            <span className="text-slate-400 text-[10px] font-mono">
              Key [{cardIdx + 1}]
            </span>
          )}
        </div>

        {/* B-I-N-G-O Headers */}
        <div className="grid grid-cols-5 gap-1 text-center font-black text-xs sm:text-sm mb-1.5">
          {BINGO_LETTERS.map((letter) => {
            const theme = LETTER_THEMES[letter];
            return (
              <div
                key={letter}
                className={`${theme.pillBg} rounded-md py-0.5 shadow-sm font-extrabold tracking-wider`}>
                {letter}
              </div>
            );
          })}
        </div>

        {/* 5x5 Grid */}
        <div className="grid grid-cols-5 gap-1 sm:gap-1.5 flex-1">
          {card.grid.map((row, r) =>
            row.map((cell, c) => {
              const isReady = (cell as any).isReadyGlow && !cell.daubed;
              const isLucky = cell.isLuckyInstant && !cell.daubed;

              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  disabled={readOnly || card.hasClaimedBingo}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!readOnly && !card.hasClaimedBingo) handleDaubCell(cardIdx, r, c);
                  }}
                  className={`relative aspect-square rounded-lg flex flex-col items-center justify-center font-black transition-all transform select-none min-w-[34px] min-h-[34px] sm:min-w-[42px] sm:min-h-[42px] ${
                    cell.daubed
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-400/60 shadow-inner'
                      : isLucky
                      ? 'bg-gradient-to-br from-amber-400/50 to-yellow-600/60 text-amber-200 border-2 border-yellow-300 shadow-[0_0_15px_rgba(250,204,21,0.8)] animate-pulse ring-2 ring-yellow-400'
                      : isReady && !readOnly && !card.hasClaimedBingo
                      ? 'bg-amber-400/30 text-white border-2 border-amber-300 animate-pulse shadow-lg ring-2 ring-amber-400/60'
                      : readOnly || card.hasClaimedBingo
                      ? 'bg-slate-800/80 text-slate-200 border border-slate-700'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 active:scale-95'
                  }`}>
                  {cell.isFree ? (
                    <span className="text-[9px] sm:text-xs font-black tracking-wider text-amber-300">
                      FREE
                    </span>
                  ) : (
                    <span className="text-xs sm:text-sm md:text-base font-extrabold leading-none">
                      {cell.number}
                    </span>
                  )}

                  {/* Lucky Instant Crown Marker */}
                  {isLucky && (
                    <div className="absolute top-0.5 right-0.5 flex items-center justify-center">
                      <Crown className="w-3.5 h-3.5 text-yellow-300 fill-yellow-400 drop-shadow" />
                    </div>
                  )}

                  {/* Stamp Overlay if Daubed */}
                  {cell.daubed && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <img
                        src="assets/images/dauber_stamp_star.png"
                        alt="stamp"
                        className="w-[85%] h-[85%] object-contain drop-shadow-md animate-in zoom-in duration-150"
                      />
                    </div>
                  )}
                </button>
              );
            }),
          )}
        </div>

        {/* Confetti & Celebratory Bingo Overlay on Individual Card */}
        {card.hasClaimedBingo && (
          <div className="absolute inset-0 z-20 rounded-2xl bg-slate-950/80 backdrop-blur-sm border-2 border-amber-400 flex flex-col items-center justify-center p-3 text-center shadow-2xl animate-in zoom-in duration-300 pointer-events-none">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-yellow-600 flex items-center justify-center shadow-xl mb-1.5 border border-amber-200 animate-bounce">
              <Trophy className="w-6 h-6 sm:w-7 sm:h-7 text-slate-950 fill-slate-950" />
            </div>
            <span className="text-xl sm:text-2xl font-black text-amber-300 tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              BINGO!
            </span>
            <span className="text-xs sm:text-sm font-extrabold text-white bg-amber-500/40 border border-amber-400/60 px-3 py-0.5 rounded-full mt-1 shadow-sm">
              🏆 {card.claimedRank === 1 ? '1st' : card.claimedRank === 2 ? '2nd' : card.claimedRank === 3 ? '3rd' : `${card.claimedRank}th`} Place Winner
            </span>
            <span className="text-[10px] sm:text-xs text-emerald-300 font-bold mt-1">
              ✓ Card Locked • Prize Secured!
            </span>
          </div>
        )}
      </div>
    );
  };

  const primaryStartBtnRef = useAutoFocus<HTMLButtonElement>(gameState.status === 'START');

  return (
    <div className="fixed inset-0 overflow-hidden touch-none flex flex-col bg-slate-950 text-white font-sans select-none">
      <BackgroundMusic url={BACKGROUND_MUSIC_URL} isPlaying={isMusicPlaying} isMuted={isMusicMuted} />

      {!assetsReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-400 mb-4" />
          <div className="text-lg font-bold">Entering Bingo Hall...</div>
        </div>
      )}

      {/* TOP HEADER / HUD BAR */}
      <header className="w-full bg-slate-900/95 border-b border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 z-20 shrink-0 shadow-lg">
        {/* Logo & Slots */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Trophy className="text-amber-400 w-5 h-5" />
            <span className="font-black text-sm tracking-wide text-amber-400">BINGO ROYALE</span>
          </div>
          <div className="bg-slate-800/90 px-2.5 py-0.5 rounded-full text-xs font-bold text-slate-300 flex items-center gap-1.5 border border-slate-700">
            <span>Slots:</span>
            <span className="text-amber-400 font-mono font-black text-sm">{slotsRemaining} / 25</span>
          </div>
        </div>

        {/* Current & Recent Balls Bar */}
        <div className="flex items-center gap-2">
          {currentBall ? (
            <div className="flex items-center gap-2 bg-slate-800/90 border border-amber-400/80 px-2.5 py-1 rounded-full shadow-md animate-pulse">
              <span className="text-[11px] font-black text-amber-400 tracking-wider">CALLED:</span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`${
                    LETTER_THEMES[getLetterForNumber(currentBall)].pillBg
                  } font-black text-xs px-2 py-0.5 rounded-full shadow-sm`}>
                  {getLetterForNumber(currentBall)}
                </span>
                <span className="bg-amber-400 text-slate-950 font-black text-sm px-2.5 py-0.5 rounded-full shadow-sm">
                  {currentBall}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/60 px-3 py-1 rounded-full text-xs text-slate-400 border border-slate-700">
              Waiting for first call...
            </div>
          )}

          {/* Recent Balls History Carousel */}
          <div className="hidden md:flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-700/80 shadow-inner">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-0.5">Past:</span>
            {recentBalls.slice(-4).reverse().map((num) => {
              const letter = getLetterForNumber(num);
              const theme = LETTER_THEMES[letter];
              return (
                <div
                  key={num}
                  className="flex items-center gap-0.5 bg-slate-900 border border-slate-700 rounded-md px-1.5 py-0.5 shadow-sm">
                  <span className={`${theme.textColor} font-black text-[11px]`}>{letter}</span>
                  <span className="text-white font-extrabold text-xs">{num}</span>
                </div>
              );
            })}
          </div>

          {/* Caller Voice Toggle */}
          <button
            type="button"
            onClick={() => setIsVoiceMuted((prev) => !prev)}
            title={isVoiceMuted ? 'Turn Female Caller Voice On' : 'Mute Female Caller Voice'}
            className={`p-1.5 rounded-xl border transition flex items-center gap-1 text-xs font-bold ${
              isVoiceMuted
                ? 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                : 'bg-indigo-950/80 text-indigo-300 border-indigo-600 hover:bg-indigo-900'
            }`}>
            {isVoiceMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span className="hidden sm:inline">Voice {isVoiceMuted ? 'Off' : 'On'}</span>
          </button>

          {/* Master Board Live Matrix Toggle (DOES NOT PAUSE GAME) */}
          <button
            type="button"
            onClick={() => setIsMasterBoardOpen((prev) => !prev)}
            className={`text-xs font-bold px-2.5 py-1.5 rounded-xl transition flex items-center gap-1 shadow border ${
              isMasterBoardOpen
                ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-300/60 font-black'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
            }`}>
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">1-75 Matrix</span>
          </button>
        </div>

        {/* Score & Menu Button */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Score</div>
            <div className="text-sm sm:text-base font-black text-amber-400 font-mono">{gameState.score}</div>
          </div>

          <button
            type="button"
            onClick={() => setIsGameMenuOpen(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-2 rounded-xl flex items-center justify-center transition active:scale-95"
            title="Open Menu (Esc)">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* POWER-UP & HELPER TOOLBAR (Auto-Play Battery, Radar Scan, 1/2/3 Daubs, Instant Bingo) */}
      <div className="w-full bg-slate-900/90 border-b border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 z-20 shrink-0 text-xs shadow-md">
        {/* Left: Auto-Play Battery with Countdown */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleAutoPlay}
            className={`px-3 py-1.5 rounded-xl font-black text-xs transition flex items-center gap-1.5 border shadow ${
              isAutoPlayActive
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-300 ring-2 ring-cyan-400/60 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}>
            <Zap className={`w-4 h-4 ${isAutoPlayActive ? 'text-yellow-300 fill-yellow-300 animate-bounce' : 'text-slate-400'}`} />
            <span>⚡ AUTO-PLAY</span>
            <span className="bg-black/40 px-1.5 py-0.5 rounded font-mono text-[11px] ml-1">
              [{formatTime(autoPlayBank)}]
            </span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isAutoPlayActive ? 'bg-emerald-500 text-black' : 'bg-slate-700 text-slate-300'}`}>
              {isAutoPlayActive ? 'ON' : 'OFF'}
            </span>
          </button>

          <span className="hidden xl:inline text-[10px] text-slate-400 italic">
            (Auto-daubs new incoming calls)
          </span>
        </div>

        {/* Right: Boosters & Consumable Items */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Radar Scan for Missed Numbers */}
          <button
            type="button"
            onClick={handleUseScan}
            title="Scan & daub all missed past called numbers"
            className="bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-600 px-2.5 py-1 rounded-xl font-bold transition flex items-center gap-1 shadow active:scale-95">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>📡 Scan</span>
            <span className="bg-cyan-500 text-black font-black text-[10px] px-1.5 py-0.2 rounded-full">
              x{scanTickets}
            </span>
          </button>

          {/* 1-Daub */}
          <button
            type="button"
            onClick={() => handleUseDaubBooster(1)}
            title="Randomly daub 1 cell on each active card"
            className="bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-600 px-2 py-1 rounded-xl font-bold transition flex items-center gap-1 shadow active:scale-95">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>+1 Daub</span>
            <span className="bg-purple-500 text-black font-black text-[10px] px-1.5 py-0.2 rounded-full">
              x{daub1Tickets}
            </span>
          </button>

          {/* 2-Daub */}
          <button
            type="button"
            onClick={() => handleUseDaubBooster(2)}
            title="Randomly daub 2 cells on each active card"
            className="bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-600 px-2 py-1 rounded-xl font-bold transition flex items-center gap-1 shadow active:scale-95">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>+2 Daub</span>
            <span className="bg-purple-500 text-black font-black text-[10px] px-1.5 py-0.2 rounded-full">
              x{daub2Tickets}
            </span>
          </button>

          {/* 3-Daub */}
          <button
            type="button"
            onClick={() => handleUseDaubBooster(3)}
            title="Randomly daub 3 cells on each active card"
            className="bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-600 px-2 py-1 rounded-xl font-bold transition flex items-center gap-1 shadow active:scale-95">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>+3 Daub</span>
            <span className="bg-purple-500 text-black font-black text-[10px] px-1.5 py-0.2 rounded-full">
              x{daub3Tickets}
            </span>
          </button>

          {/* Instant BINGO Crown Item */}
          <button
            type="button"
            onClick={handleUseInstantBingo}
            title="Places Golden Crown cell: daubing it gives Instant Bingo!"
            className="bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-500 px-2.5 py-1 rounded-xl font-black transition flex items-center gap-1 shadow active:scale-95">
            <Crown className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
            <span>👑 Instant Target</span>
            <span className="bg-amber-400 text-black font-black text-[10px] px-1.5 py-0.2 rounded-full">
              x{instantBingoTickets}
            </span>
          </button>

          {/* Restock Helper */}
          <button
            type="button"
            onClick={handleRestockBoosters}
            title="Recharge +Free Boosters & Auto-Play Bank"
            className="bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-600 p-1.5 rounded-xl transition flex items-center justify-center">
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
          </button>
        </div>
      </div>

      {/* MAIN GAMEPLAY PLAYFIELD */}
      <main className="flex-1 w-full min-h-0 relative flex flex-col lg:flex-row items-center justify-center p-2 sm:p-4 gap-2 sm:gap-4 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-40 z-0"
        />

        {/* LEFT SIDEBAR: LIVE 30-PLAYER ROOM & LEADERBOARD */}
        <section className="w-full lg:w-72 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-2.5 flex flex-col shrink-0 max-h-44 lg:max-h-full z-10 overflow-hidden shadow-xl">
          <div className="flex items-center justify-between gap-1 mb-2 pb-1 border-b border-slate-800">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSidebarTab('winners')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  sidebarTab === 'winners'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <Trophy className="w-3.5 h-3.5" />
                <span>Winners ({leaderboard.length}/25)</span>
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('bots')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                  sidebarTab === 'bots'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <Users className="w-3.5 h-3.5" />
                <span>Rivals ({botsRef.current.length})</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Winners Podium */}
          {sidebarTab === 'winners' && (
            <div className="flex-1 overflow-y-auto touch-auto space-y-1 pr-1 text-xs">
              {leaderboard.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs italic">
                  Race is on! Daub matching numbers fast!
                </div>
              ) : (
                leaderboard.map((entry) => (
                  <div
                    key={entry.rank}
                    className={`flex items-center justify-between p-1.5 rounded-lg font-mono ${
                      entry.isPlayer
                        ? 'bg-amber-500/25 border border-amber-400 text-amber-300 font-bold shadow'
                        : 'bg-slate-800/70 text-slate-300'
                    }`}>
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`text-xs font-black w-5 text-center ${
                          entry.rank === 1
                            ? 'text-yellow-400 font-extrabold'
                            : entry.rank === 2
                            ? 'text-slate-200'
                            : entry.rank === 3
                            ? 'text-amber-500'
                            : 'text-slate-400'
                        }`}>
                        #{entry.rank}
                      </span>
                      <span className="truncate">{entry.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatTime(entry.timeSeconds)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 2: Live Room Rivals */}
          {sidebarTab === 'bots' && (
            <div className="flex-1 overflow-y-auto touch-auto space-y-1 pr-1 text-xs">
              {botsRef.current.map((bot) => {
                const isWinner = bot.hasWon;
                const isOneToGo = !isWinner && bot.minRemainingToLine === 1;
                const isTwoToGo = !isWinner && bot.minRemainingToLine === 2;

                return (
                  <div
                    key={bot.id}
                    onClick={() => setInspectedBot(bot)}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 cursor-pointer transition">
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                        style={{backgroundColor: bot.avatarColor}}
                      />
                      <span className="truncate font-semibold text-slate-200">{bot.name}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isWinner ? (
                        <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/40">
                          #{bot.rank} Won
                        </span>
                      ) : isOneToGo ? (
                        <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-500/50 animate-pulse">
                          🔥 1 to go!
                        </span>
                      ) : isTwoToGo ? (
                        <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-1.5 py-0.5 rounded">
                          2 to go
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">
                          {bot.totalDaubs} daubed
                        </span>
                      )}

                      <span className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold bg-slate-900 px-1 py-0.5 rounded border border-slate-700">
                        View
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Live Activity Ticker */}
          <div className="mt-2 pt-1 border-t border-slate-800 text-[10px] text-slate-400 truncate">
            {tickerMessages[0] ? (
              <span className="text-amber-300 animate-pulse">{tickerMessages[0].text}</span>
            ) : (
              <span>Bingo hall open • 30 contestants live</span>
            )}
          </div>
        </section>

        {/* CENTER STAGE: BINGO CARDS CONTAINER */}
        <section className="flex-1 flex flex-col items-center justify-center w-full z-10 overflow-y-auto touch-auto py-1">
          {boardCount > 1 && (
            <div className="flex items-center gap-2 mb-2">
              {playerCards.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveBoardIndex(idx)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition flex items-center gap-1.5 shadow ${
                    activeBoardIndex === idx
                      ? 'bg-amber-400 text-black shadow-lg scale-105 ring-2 ring-amber-300/50'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                  }`}>
                  <span>Card {idx + 1}</span>
                  {playerCards[idx]?.completedLines > 0 && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  )}
                  {playerCards[idx]?.readyLineCount > 0 && playerCards[idx]?.completedLines === 0 && (
                    <span className="text-[9px] bg-amber-500/30 text-amber-200 px-1 rounded">1 to go</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div
            className={`w-full flex items-center justify-center gap-3 sm:gap-4 flex-wrap ${
              boardCount === 4 ? 'max-w-4xl' : 'max-w-3xl'
            }`}>
            {boardCount === 1 && playerCards[0] && renderCard(playerCards[0], 0)}

            {boardCount === 2 &&
              playerCards.map((card, idx) => (
                <div key={card.id} className="w-full sm:w-[48%] flex justify-center">
                  {renderCard(card, idx)}
                </div>
              ))}

            {boardCount === 4 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 w-full justify-items-center">
                {playerCards.map((card, idx) => renderCard(card, idx, true))}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT ACTION PANEL: CURRENT BALL & SHOUT BINGO BUTTON */}
        <section className="w-full lg:w-60 flex flex-col items-center justify-center p-2 z-10 shrink-0 gap-3">
          <div className="relative flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800 p-4 w-full shadow-2xl">
            <div className="text-xs text-slate-300 font-bold uppercase mb-2 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Drawn Ball</span>
            </div>

            {currentBall ? (
              <div className="flex flex-col items-center justify-center animate-in zoom-in duration-200">
                <div className="relative w-28 h-28 rounded-full bg-gradient-to-b from-amber-300 via-amber-500 to-yellow-600 shadow-[0_10px_25px_rgba(245,158,11,0.4)] flex items-center justify-center p-2 border-2 border-amber-200">
                  <div className="absolute top-2 left-3 w-8 h-4 rounded-full bg-white/40 blur-[1px] transform -rotate-45" />

                  <div className="w-20 h-20 rounded-full bg-white shadow-inner flex flex-col items-center justify-center border border-slate-200">
                    <span
                      className={`${
                        LETTER_THEMES[getLetterForNumber(currentBall)].pillBg
                      } text-[11px] font-black px-2.5 py-0.2 rounded-full shadow-sm leading-tight tracking-wider mb-0.5`}>
                      {getLetterForNumber(currentBall)}
                    </span>

                    <span className="text-slate-950 font-black text-3xl sm:text-4xl leading-none tracking-tight">
                      {currentBall}
                    </span>
                  </div>
                </div>

                <span className="text-[11px] font-bold text-amber-300 mt-2">
                  Call: {getLetterForNumber(currentBall)}-{currentBall}
                </span>
              </div>
            ) : (
              <div className="w-28 h-28 rounded-full border-2 border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500 text-xs text-center p-3">
                <Activity className="w-5 h-5 mb-1 animate-pulse" />
                <span>Drawing ball...</span>
              </div>
            )}
          </div>

          {/* BINGO SHOUT BUTTON */}
          <button
            type="button"
            onClick={handleClaimBingo}
            className={`relative group w-full max-w-[220px] aspect-square rounded-3xl flex flex-col items-center justify-center transition-transform active:scale-95 ${
              hasValidBingo
                ? 'animate-bounce shadow-[0_0_35px_rgba(245,158,11,0.7)] ring-4 ring-amber-400'
                : 'opacity-90 hover:opacity-100'
            }`}>
            <img
              src="assets/images/bingo_shout_badge.png"
              alt="BINGO Shout"
              className="absolute inset-0 w-full h-full object-contain filter drop-shadow-2xl transition-transform group-hover:scale-105"
            />
            <div className="relative z-10 flex flex-col items-center pointer-events-none">
              <span className="font-black text-2xl sm:text-3xl text-white tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                BINGO!
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-amber-200 uppercase bg-black/60 px-2.5 py-0.5 rounded-full mt-1">
                {hasValidBingo ? '🔥 READY! CLAIM!' : 'Press / Space'}
              </span>
            </div>
          </button>
        </section>
      </main>

      {/* MASTER BOARD 1-75 FLOATING DRAWER (DOES NOT PAUSE GAME!) */}
      {isMasterBoardOpen && (
        <div className="fixed top-14 right-2 sm:right-6 z-40 w-full max-w-lg bg-slate-900/95 backdrop-blur-xl border-2 border-amber-400 rounded-3xl p-4 shadow-2xl flex flex-col text-slate-100 animate-in slide-in-from-top duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
              <h2 className="text-sm sm:text-base font-black text-amber-400">
                75-NUMBER MASTER BOARD (LIVE)
              </h2>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/40">
                • Live Game Running
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsMasterBoardOpen(false)}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5 text-xs">
            {BINGO_LETTERS.map((letter) => {
              const [min, max] = LETTER_RANGES[letter];
              const nums: number[] = [];
              for (let n = min; n <= max; n++) nums.push(n);
              const theme = LETTER_THEMES[letter];
              return (
                <div key={letter} className="flex items-center gap-1.5">
                  <span className={`w-5 font-black ${theme.textColor} text-center`}>{letter}</span>
                  <div className="flex-1 flex flex-wrap gap-1">
                    {nums.map((n) => {
                      const isDrawn = calledNumbersRef.current.includes(n);
                      const isCurrent = currentBallRef.current === n;
                      return (
                        <span
                          key={n}
                          className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[10px] transition-all ${
                            isCurrent
                              ? 'bg-amber-400 text-black font-black ring-2 ring-white scale-110 shadow-lg'
                              : isDrawn
                              ? 'bg-amber-500/80 text-black font-black shadow'
                              : 'bg-slate-800 text-slate-500'
                          }`}>
                          {n}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <span>{calledNumbersRef.current.length} / 75 numbers drawn</span>
            <button
              type="button"
              onClick={() => setIsMasterBoardOpen(false)}
              className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold px-3 py-1 rounded-lg transition">
              Minimize
            </button>
          </div>
        </div>
      )}

      {/* BOT COMPETITOR BOARD INSPECTOR MODAL */}
      {inspectedBot && (
        <MenuOverlay tone="neutral" zIndex={65}>
          <div className="w-full max-w-2xl bg-slate-900 border-2 border-indigo-500 rounded-3xl p-5 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-5 h-5 rounded-full shadow"
                  style={{backgroundColor: inspectedBot.avatarColor}}
                />
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                    <span>{inspectedBot.name}'s Real Bingo Board</span>
                    {inspectedBot.hasWon && (
                      <span className="bg-emerald-500 text-black text-xs font-black px-2 py-0.5 rounded-full">
                        #{inspectedBot.rank} Winner
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Reaction: {(inspectedBot.reactionSpeed).toFixed(2)}s • Total Daubs: {inspectedBot.totalDaubs} • Closest Line: {inspectedBot.minRemainingToLine} left
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedBot(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[65vh] flex flex-wrap items-center justify-center gap-3 p-1">
              {inspectedBot.cards.map((card, idx) => (
                <div key={card.id} className="w-full max-w-[340px] flex justify-center">
                  {renderCard(card, idx, true, true)}
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedBot(null)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2 rounded-xl text-sm transition">
                CLOSE INSPECTOR
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}

      {/* HOW TO PLAY OVERLAY MODAL */}
      {isHowToPlayOpen && (
        <MenuOverlay tone="neutral" zIndex={70}>
          <div className="w-full max-w-lg bg-slate-900 border-2 border-indigo-500 rounded-3xl p-6 shadow-2xl flex flex-col text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-6 h-6 text-indigo-400" />
                <h2 className="text-2xl font-black text-yellow-400">HOW TO PLAY</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsHowToPlayOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm overflow-y-auto max-h-[60vh] pr-1">
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                <h3 className="font-bold text-amber-300 mb-1 flex items-center gap-1">
                  <span>1. 30-Player Royale & 25 Prize Slots</span>
                </h3>
                <p className="text-xs text-slate-300">
                  You compete against 29 real-named AI contestants with legitimate 5x5 boards. Claim BINGO before the 25 winner slots fill up!
                </p>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                <h3 className="font-bold text-cyan-300 mb-1 flex items-center gap-1">
                  <span>2. ⚡ Auto-Play & 📡 Radar Scan</span>
                </h3>
                <p className="text-xs text-slate-300">
                  • <strong>⚡ Auto-Play (10 Min Pool):</strong> When enabled, automatically daubs newly called balls. (Does not daub old missed ones).<br />
                  • <strong>📡 Radar Scan:</strong> Scans and instantly marks all previously missed valid numbers!
                </p>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                <h3 className="font-bold text-amber-300 mb-1 flex items-center gap-1">
                  <span>3. 👑 Golden Crown Instant Bingo & Boosters</span>
                </h3>
                <p className="text-xs text-slate-300">
                  • <strong>👑 Instant Target:</strong> Places a glowing Golden Crown cell on your cards. Daubing it instantly completes a Bingo line!<br />
                  • <strong>+1 / +2 / +3 Daubs:</strong> Stamps random extra cells on each card!
                </p>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                <h3 className="font-bold text-amber-300 mb-1 flex items-center gap-1">
                  <span>4. Controls & Hotkeys</span>
                </h3>
                <p className="text-xs text-slate-300">
                  • <strong>Click / Tap:</strong> Daub numbers & shout Bingo.<br />
                  • <strong>Keys 1 / 2 / 3 / 4:</strong> Switch card focus.<br />
                  • <strong>Spacebar:</strong> Shout BINGO!<br />
                  • <strong>Esc:</strong> Toggle Pause Menu.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHowToPlayOpen(false)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-black px-6 py-2.5 rounded-xl transition">
                GOT IT
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}

      {/* GAME MENU OVERLAY */}
      {isGameMenuOpen && (
        <MenuOverlay tone="neutral" zIndex={50}>
          <div className="w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-slate-100">
            <h2 className="text-3xl font-black text-yellow-400 mb-6 tracking-wide">
              GAME MENU
            </h2>

            <div className="w-full flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setIsGameMenuOpen(false)}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-3 rounded-2xl text-lg transition flex items-center justify-center gap-2 shadow-lg">
                <Play className="w-5 h-5" />
                RESUME
              </button>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !isSfxMuted;
                    setIsSfxMuted(next);
                    gameAudio.setMuted(next);
                  }}
                  className={`py-2 px-2 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 border transition ${
                    isSfxMuted
                      ? 'bg-slate-800 text-slate-400 border-slate-700'
                      : 'bg-indigo-950 text-indigo-300 border-indigo-600'
                  }`}>
                  {isSfxMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  <span>SFX: {isSfxMuted ? 'Off' : 'On'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsMusicMuted((prev) => !prev)}
                  className={`py-2 px-2 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 border transition ${
                    isMusicMuted
                      ? 'bg-slate-800 text-slate-400 border-slate-700'
                      : 'bg-indigo-950 text-indigo-300 border-indigo-600'
                  }`}>
                  {isMusicMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  <span>BGM: {isMusicMuted ? 'Off' : 'On'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsVoiceMuted((prev) => !prev)}
                  className={`py-2 px-2 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 border transition ${
                    isVoiceMuted
                      ? 'bg-slate-800 text-slate-400 border-slate-700'
                      : 'bg-indigo-950 text-indigo-300 border-indigo-600'
                  }`}>
                  {isVoiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  <span>Voice: {isVoiceMuted ? 'Off' : 'On'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsHowToPlayOpen(true)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2 border border-slate-700">
                <HelpCircle className="w-4 h-4 text-indigo-400" />
                HOW TO PLAY
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsGameMenuOpen(false);
                  initGame();
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2 border border-slate-700">
                <RotateCw className="w-4 h-4 text-amber-400" />
                RESTART ROUND
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsGameMenuOpen(false);
                  setGameState((prev) => ({...prev, status: 'START'}));
                }}
                className="w-full bg-red-950/60 hover:bg-red-900/80 text-red-300 font-bold py-2.5 rounded-xl text-sm transition border border-red-800/60">
                QUIT TO MAIN MENU
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}

      {/* START SCREEN OVERLAY */}
      {gameState.status === 'START' && (
        <MenuOverlay tone="neutral">
          <div className="w-full max-w-md bg-slate-900/95 border-2 border-amber-500/80 p-6 sm:p-8 rounded-3xl shadow-2xl flex flex-col items-center text-center backdrop-blur-xl">
            <div className="relative mb-4 flex flex-col items-center">
              <img
                src="assets/images/trophy_winner_cup.png"
                alt="Trophy"
                className="w-20 h-20 object-contain drop-shadow-xl mb-2"
              />
              <h1 className="text-3xl sm:text-5xl font-black text-amber-400 tracking-wider">
                BINGO ROYALE
              </h1>
              <span className="text-xs font-bold text-amber-200/80 uppercase tracking-widest mt-1">
                30-Player Showdown • 25 Prize Slots
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 mb-6 leading-relaxed">
              Match numbers with authentic bot rivals, trigger quick reflex combos, use <strong className="text-cyan-400">⚡ Auto-Play</strong> & <strong className="text-amber-400">👑 Instant Bingo</strong>, and shout <strong className="text-amber-400">BINGO</strong> to claim a winner slot!
            </p>

            {/* Board Count Selector */}
            <div className="w-full mb-6">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Select Number of Cards:
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setBoardCount(count as 1 | 2 | 4)}
                    className={`py-2.5 rounded-xl font-black text-sm sm:text-base border-2 transition ${
                      boardCount === count
                        ? 'bg-amber-400 text-black border-amber-300 shadow-lg scale-105'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}>
                    {count} {count === 1 ? 'Card' : 'Cards'}
                  </button>
                ))}
              </div>
            </div>

            {/* Start Button */}
            <button
              ref={primaryStartBtnRef}
              type="button"
              onClick={initGame}
              autoFocus
              className="w-full bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-black font-black py-4 rounded-2xl text-lg sm:text-xl transition-all transform hover:scale-[1.02] active:scale-95 shadow-xl flex items-center justify-center gap-2 mb-3">
              <Play className="w-6 h-6 fill-current" />
              ENTER SHOWDOWN
            </button>

            <button
              type="button"
              onClick={() => setIsHowToPlayOpen(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1">
              <HelpCircle className="w-4 h-4" />
              How to Play & Rules
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* END-OF-ROUND SUMMARY & VICTORY / GAME OVER MODAL */}
      {(gameState.status === 'VICTORY' || gameState.status === 'GAME_OVER') && (
        <div
          data-testid="summary-modal"
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto pointer-events-auto select-none">
          <div className="w-full max-w-lg bg-slate-900/95 border-2 border-amber-500 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center my-auto animate-in zoom-in-95 duration-200">
            <div className="relative mb-3 flex flex-col items-center">
              <div
                className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-2xl mb-2 border-2 ${
                  gameState.status === 'VICTORY'
                    ? 'bg-gradient-to-br from-amber-300 via-amber-400 to-yellow-600 border-amber-200'
                    : 'bg-gradient-to-br from-red-500 to-rose-700 border-red-300'
                }`}>
                {gameState.status === 'VICTORY' ? (
                  <Trophy className="w-9 h-9 sm:w-11 sm:h-11 text-slate-950 fill-slate-950" />
                ) : (
                  <Award className="w-9 h-9 sm:w-11 sm:h-11 text-white" />
                )}
              </div>

              <h2
                className={`text-2xl sm:text-4xl font-black tracking-wide ${
                  gameState.status === 'VICTORY' ? 'text-amber-400' : 'text-red-400'
                }`}>
                {gameState.status === 'VICTORY' ? 'ROUND FINISHED!' : 'ALL 25 SLOTS CLAIMED!'}
              </h2>

              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                {gameState.status === 'VICTORY'
                  ? `🎉 Awesome play! You secured winning prize slot(s)!`
                  : `Opponents claimed the 25 prize slots first. Good attempt!`}
              </p>
            </div>

            <div className="w-full grid grid-cols-2 gap-2 sm:gap-3 bg-slate-950/70 border border-slate-800 rounded-2xl p-3 sm:p-4 mb-4">
              <div className="flex flex-col items-center">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Final Score
                </span>
                <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                  {gameState.score}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Time Elapsed
                </span>
                <span className="text-xl sm:text-2xl font-black text-slate-200 font-mono">
                  {formatTime(gameState.timer || 0)}
                </span>
              </div>
            </div>

            {/* Card-by-Card Placement Results */}
            <div className="w-full mb-4 text-left">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Your Card Performance:</span>
                <span className="text-amber-300 font-normal">
                  {playerCards.filter((c) => c.hasClaimedBingo).length} of {boardCount} completed
                </span>
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {playerCards.map((card) => (
                  <div
                    key={card.id}
                    className={`flex items-center justify-between p-2 rounded-xl border text-xs font-mono ${
                      card.hasClaimedBingo
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 font-bold'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
                    }`}>
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-900 px-2 py-0.5 rounded text-[11px] text-slate-300 font-sans font-bold">
                        Card #{card.id}
                      </span>
                      <span>
                        {card.hasClaimedBingo ? 'BINGO ACHIEVED' : 'Unfinished'}
                      </span>
                    </div>

                    <div>
                      {card.hasClaimedBingo ? (
                        <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 font-black text-[11px] px-2.5 py-0.5 rounded-full shadow">
                          🏆 {card.claimedRank === 1 ? '1st' : card.claimedRank === 2 ? '2nd' : card.claimedRank === 3 ? '3rd' : `#${card.claimedRank}`} Place
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">No Bingo</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Change Mode Selector */}
            <div className="w-full mb-4">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 text-left">
                Play Next Round With:
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setBoardCount(count as 1 | 2 | 4)}
                    className={`py-2 rounded-xl font-black text-xs sm:text-sm border-2 transition ${
                      boardCount === count
                        ? 'bg-amber-400 text-black border-amber-300 shadow-md scale-105'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}>
                    {count} {count === 1 ? 'Card' : 'Cards'}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full flex flex-col gap-2 pointer-events-auto">
              <button
                type="button"
                onClick={initGame}
                autoFocus
                className="w-full bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black py-3.5 rounded-2xl text-base sm:text-lg transition-transform transform active:scale-95 shadow-xl flex items-center justify-center gap-2">
                <RotateCw className="w-5 h-5" />
                PLAY AGAIN ({boardCount} {boardCount === 1 ? 'Card' : 'Cards'})
              </button>

              <button
                type="button"
                onClick={() => {
                  setGameState((prev) => ({...prev, status: 'START'}));
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs sm:text-sm transition border border-slate-700">
                RETURN TO MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
