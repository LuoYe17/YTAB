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

function realBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** 旧存储缺字段时补上当前默认。嵌套布尔只认真正的 boolean，导入脏值不能 Boolean("false") 变 true。 */
export function mergeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const s = raw ?? {};
  const wallhavenApiKey = typeof s.wallhavenApiKey === 'string' ? s.wallhavenApiKey : '';
  return {
    openTarget: s.openTarget === 'new' ? 'new' : 'current',
    bingEndpoint: s.bingEndpoint === 'www' ? 'www' : 'cn',
    wallhavenApiKey,
    // 测通标记不能单独成立：没密钥或脏 true 都会在下次打开设置时画出假勾。
    wallhavenKeyOk: s.wallhavenKeyOk === true && wallhavenApiKey !== '',
    wallhavenPurity: {
      sfw: realBool(s.wallhavenPurity?.sfw, DEFAULT_SETTINGS.wallhavenPurity.sfw),
      sketchy: realBool(s.wallhavenPurity?.sketchy, DEFAULT_SETTINGS.wallhavenPurity.sketchy),
      nsfw: realBool(s.wallhavenPurity?.nsfw, DEFAULT_SETTINGS.wallhavenPurity.nsfw),
    },
    wallhavenCategories: {
      general: realBool(s.wallhavenCategories?.general, DEFAULT_SETTINGS.wallhavenCategories.general),
      anime: realBool(s.wallhavenCategories?.anime, DEFAULT_SETTINGS.wallhavenCategories.anime),
      people: realBool(s.wallhavenCategories?.people, DEFAULT_SETTINGS.wallhavenCategories.people),
    },
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
