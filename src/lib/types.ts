/** Domain types for YTAB persisted state. */

export type OpenTarget = 'current' | 'new';

export type BingEndpoint = 'cn' | 'www';

export type WallhavenPurity = {
  sfw: boolean;
  sketchy: boolean;
  nsfw: boolean;
};

/** Wallhaven `sorting=`；热门时请求还要带 `topRange`。 */
export type WallhavenSorting =
  | 'random'
  | 'date_added'
  | 'relevance'
  | 'views'
  | 'favorites'
  | 'toplist';

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
  /** 测通后记下，关掉设置再开仍显示勾；改密钥或测失败清掉。 */
  wallhavenKeyOk: boolean;
  wallhavenPurity: WallhavenPurity;
  /** Wallhaven categories bits: general/anime/people as booleans */
  wallhavenCategories: {
    general: boolean;
    anime: boolean;
    people: boolean;
  };
  wallhavenSorting: WallhavenSorting;
  /** 预设关键词 id，空则不限；写入搜索 `q=`。 */
  wallhavenTags: string[];
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
  wallhavenKeyOk: false,
  wallhavenPurity: { sfw: true, sketchy: false, nsfw: false },
  wallhavenCategories: { general: false, anime: true, people: false },
  wallhavenSorting: 'toplist',
  wallhavenTags: [],
};

export const EMPTY_HITOKOTO: HitokotoState = {
  text: '',
  from: '',
};

const SORTING: WallhavenSorting[] = [
  'random',
  'date_added',
  'relevance',
  'views',
  'favorites',
  'toplist',
];

/** 旧存储缺字段时补上当前默认，已有的分类/纯度原样保留。 */
export function mergeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const s = raw ?? {};
  return {
    openTarget: s.openTarget === 'new' ? 'new' : 'current',
    bingEndpoint: s.bingEndpoint === 'www' ? 'www' : 'cn',
    wallhavenApiKey: typeof s.wallhavenApiKey === 'string' ? s.wallhavenApiKey : '',
    wallhavenKeyOk: Boolean(s.wallhavenKeyOk),
    wallhavenPurity: { ...DEFAULT_SETTINGS.wallhavenPurity, ...s.wallhavenPurity },
    wallhavenCategories: { ...DEFAULT_SETTINGS.wallhavenCategories, ...s.wallhavenCategories },
    wallhavenSorting: SORTING.includes(s.wallhavenSorting as WallhavenSorting)
      ? (s.wallhavenSorting as WallhavenSorting)
      : DEFAULT_SETTINGS.wallhavenSorting,
    wallhavenTags: Array.isArray(s.wallhavenTags)
      ? s.wallhavenTags.filter((t) => typeof t === 'string')
      : [...DEFAULT_SETTINGS.wallhavenTags],
  };
}

export function createEmptyState(): YtabState {
  return {
    onboardingDone: false,
    settings: {
      ...DEFAULT_SETTINGS,
      wallhavenPurity: { ...DEFAULT_SETTINGS.wallhavenPurity },
      wallhavenCategories: { ...DEFAULT_SETTINGS.wallhavenCategories },
      wallhavenTags: [...DEFAULT_SETTINGS.wallhavenTags],
    },
    pages: [[]],
    wallpaper: { imageUrl: '', fetchedOn: '' },
    hitokoto: { ...EMPTY_HITOKOTO },
  };
}
