import {SpriteConfig} from './utils/helper';

/**
 * Configuration for Bingo Royale.
 */
export const CONFIG = {
  // Game Setup
  title: {
    value: 'Bingo Royale',
    type: 'string',
    label: 'Game Title',
    group: 'GAME',
  },
  baseCanvasWidth: {
    value: 1376,
    type: 'number',
    label: 'Base Canvas Width',
    group: 'GAME',
  },
  baseCanvasHeight: {
    value: 768,
    type: 'number',
    label: 'Base Canvas Height',
    group: 'GAME',
  },

  // System
  targetFPS: {
    value: 60,
    type: 'number',
    label: 'Target FPS',
    group: 'SYSTEM',
  },
  stepMs: {
    value: 1000 / 60,
    type: 'number',
    label: 'Step MS',
    group: 'SYSTEM',
  },
  maxSubSteps: {
    value: 5,
    type: 'number',
    label: 'Max Sub Steps',
    group: 'SYSTEM',
  },

  // Theme
  backgroundColor: {
    value: '#1e1035',
    type: 'color',
    label: 'Background Color',
    group: 'THEME',
  },
  primaryColor: {
    value: '#f59e0b',
    type: 'color',
    label: 'Primary Gold Color',
    group: 'THEME',
  },
  fontFamily: {
    value: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    type: 'string',
    label: 'Font Family',
    group: 'THEME',
  },

  // Audio Defaults
  defaultMusicVolume: {
    value: 0.5,
    type: 'number',
    label: 'Default Music Volume',
    group: 'AUDIO',
  },
  defaultSfxVolume: {
    value: 0.6,
    type: 'number',
    label: 'Default SFX Volume',
    group: 'AUDIO',
  },

  // Gameplay Rules (Tunable)
  callIntervalSeconds: {
    value: 3.5,
    type: 'number',
    label: 'Ball Call Interval (s)',
    group: 'Rules',
  },
  quickDaubWindowSeconds: {
    value: 1.8,
    type: 'number',
    label: 'Quick Reflex Daub Window (s)',
    group: 'Rules',
  },
  totalBots: {
    value: 29,
    type: 'number',
    label: 'Bot Competitors',
    group: 'Rules',
  },
  totalPrizeSlots: {
    value: 25,
    type: 'number',
    label: 'Winning Prize Slots',
    group: 'Rules',
  },
  autoDaubAssist: {
    value: false,
    type: 'boolean',
    label: 'Auto Daub Assist',
    group: 'Rules',
  },
  readyLineHighlight: {
    value: true,
    type: 'boolean',
    label: 'Ready-Line Glow Assist',
    group: 'Rules',
  },
  scoreCorrectDaub: {
    value: 50,
    type: 'number',
    label: 'Score Correct Daub',
    group: 'Rules',
  },
  scoreQuickBonus: {
    value: 100,
    type: 'number',
    label: 'Score Quick Bonus',
    group: 'Rules',
  },

  // Asset Metadata constants (preserves aspect ratios)
  assetBgWidth: {
    value: 1376,
    type: 'number',
    label: 'BG Width',
    group: 'ASSETS',
  },
  assetBgHeight: {
    value: 768,
    type: 'number',
    label: 'BG Height',
    group: 'ASSETS',
  },
  assetBgAspectRatio: {
    value: 1376 / 768,
    type: 'number',
    label: 'BG Aspect Ratio',
    group: 'ASSETS',
  },
  assetBallWidth: {
    value: 695,
    type: 'number',
    label: 'Ball Width',
    group: 'ASSETS',
  },
  assetBallHeight: {
    value: 694,
    type: 'number',
    label: 'Ball Height',
    group: 'ASSETS',
  },
  assetBallAspectRatio: {
    value: 695 / 694,
    type: 'number',
    label: 'Ball Aspect Ratio',
    group: 'ASSETS',
  },
  assetDauberWidth: {
    value: 742,
    type: 'number',
    label: 'Dauber Stamp Width',
    group: 'ASSETS',
  },
  assetDauberHeight: {
    value: 670,
    type: 'number',
    label: 'Dauber Stamp Height',
    group: 'ASSETS',
  },
  assetDauberAspectRatio: {
    value: 742 / 670,
    type: 'number',
    label: 'Dauber Stamp Aspect Ratio',
    group: 'ASSETS',
  },
  assetBadgeWidth: {
    value: 696,
    type: 'number',
    label: 'Bingo Badge Width',
    group: 'ASSETS',
  },
  assetBadgeHeight: {
    value: 640,
    type: 'number',
    label: 'Bingo Badge Height',
    group: 'ASSETS',
  },
  assetBadgeAspectRatio: {
    value: 696 / 640,
    type: 'number',
    label: 'Bingo Badge Aspect Ratio',
    group: 'ASSETS',
  },
  assetTrophyWidth: {
    value: 626,
    type: 'number',
    label: 'Trophy Width',
    group: 'ASSETS',
  },
  assetTrophyHeight: {
    value: 685,
    type: 'number',
    label: 'Trophy Height',
    group: 'ASSETS',
  },
  assetTrophyAspectRatio: {
    value: 626 / 685,
    type: 'number',
    label: 'Trophy Aspect Ratio',
    group: 'ASSETS',
  },
};

// Merge customized config values if present (injected by Playground)
const {playgroundConfig} = globalThis as {
  playgroundConfig?: Record<string, unknown>;
};
if (playgroundConfig) {
  for (const [key, value] of Object.entries(playgroundConfig)) {
    if (key in CONFIG) {
      Object.assign(CONFIG[key as keyof typeof CONFIG], {value});
    }
  }
}

/** Type helper for reading values in game code */
export type ConfigKey = keyof typeof CONFIG;

/**
 * Gets a configuration value by key.
 * @param key The configuration key.
 * @return The configuration value.
 */
export function getConfig<K extends ConfigKey>(
  key: K,
): (typeof CONFIG)[K]['value'] {
  return CONFIG[key].value;
}
