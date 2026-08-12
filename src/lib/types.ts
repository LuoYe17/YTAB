/** Domain types for YTAB persisted state. */

export type OpenTarget = 'current' | 'new';

export type BingEndpoint = 'cn' | 'www';

export type WallhavenPurity = {
  sfw: boolean;
  sketchy: boolean;
  nsfw: boolean;
};

export type AppItem = {
  id: string;
  kind: 'app';
  name: string;
  url: string;
  /** data URL, https URL, or empty for placeholder */
  icon: string;
};

export type FolderItem = {
  id: string;
  kind: 'folder';
  name: string;
  children: AppItem[];
};

export type GridItem = AppItem | FolderItem;

export type Settings = {
  openTarget: OpenTarget;
  bingEndpoint: BingEndpoint;
  wallhavenApiKey: string;
  wallhavenPurity: WallhavenPurity;
  /** Wallhaven categories bits: general/anime/people as booleans */
  wallhavenCategories: {
    general: boolean;
    anime: boolean;
    people: boolean;
  };
};

export type WallpaperState = {
  /** Object URL or https URL for display */
  imageUrl: string;
  /** Local calendar date YYYY-MM-DD when wallpaper was last successfully fetched */
  fetchedOn: string;
  wallhavenId?: string;
};

export type HitokotoState = {
  text: string;
  from: string;
};

export type YtabState = {
  /** null = first-run not completed */
  onboardingDone: boolean;
  settings: Settings;
  /** Flat list of pages; each page is ordered grid items */
  pages: GridItem[][];
  wallpaper: WallpaperState;
  hitokoto: HitokotoState;
};

export const DEFAULT_SETTINGS: Settings = {
  openTarget: 'current',
  bingEndpoint: 'cn',
  wallhavenApiKey: '',
  wallhavenPurity: { sfw: true, sketchy: false, nsfw: false },
  wallhavenCategories: { general: true, anime: true, people: true },
};

export const EMPTY_HITOKOTO: HitokotoState = {
  text: '',
  from: '',
};

export function createEmptyState(): YtabState {
  return {
    onboardingDone: false,
    settings: { ...DEFAULT_SETTINGS, wallhavenPurity: { ...DEFAULT_SETTINGS.wallhavenPurity }, wallhavenCategories: { ...DEFAULT_SETTINGS.wallhavenCategories } },
    pages: [[]],
    wallpaper: { imageUrl: '', fetchedOn: '' },
    hitokoto: { ...EMPTY_HITOKOTO },
  };
}
