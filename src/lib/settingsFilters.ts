/** 设置里壁纸筛选：尺度/分类/标签/排序/密钥。界面不允许全关；没密钥不能开「少儿不宜」。 */

import {
  DEFAULT_SETTINGS,
  sortingForTagSet,
  type Settings,
  type WallhavenPurity,
  type WallhavenSorting,
} from './types';

type PurityKey = keyof WallhavenPurity;
type CategoryKey = keyof Settings['wallhavenCategories'];

function countOn(flags: Record<string, boolean>): number {
  return Object.values(flags).filter(Boolean).length;
}

/** 正要把最后一项开着的关掉。 */
export function isTurningOffLast(
  flags: Record<string, boolean>,
  key: string,
  next: boolean,
): boolean {
  return !next && !!flags[key] && countOn(flags) === 1;
}

/**
 * 切换一项尺度。最后一项开着时关不掉；没密钥时开「少儿不宜」无效。
 */
export function togglePurity(
  current: WallhavenPurity,
  key: PurityKey,
  next: boolean,
  hasKey: boolean,
): WallhavenPurity {
  if (key === 'nsfw' && next && !hasKey) return current;
  if (isTurningOffLast(current, key, next)) return current;
  return { ...current, [key]: next };
}

/**
 * 切换一项分类。最后一项开着时关不掉。
 */
export function toggleCategory(
  current: Settings['wallhavenCategories'],
  key: CategoryKey,
  next: boolean,
): Settings['wallhavenCategories'] {
  if (isTurningOffLast(current, key, next)) return current;
  return { ...current, [key]: next };
}

/** 清空密钥时把「少儿不宜」写成关；若因此一项都不剩，改开安全，避免尺度全关。 */
export function purityAfterClearingKey(current: WallhavenPurity): WallhavenPurity {
  if (!current.nsfw) return current;
  const next = { ...current, nsfw: false };
  if (countOn(next) === 0) next.sfw = true;
  return next;
}

type TagPreset = { id: string; label: string };

/** 各分类自己的一小撮词；多开分类时按常规→动漫→人物并集，同 id 只留一次。 */
const WALLHAVEN_TAG_PRESETS: Record<CategoryKey, TagPreset[]> = {
  general: [
    { id: 'landscape', label: '风景' },
    { id: 'nature', label: '自然' },
    { id: 'cityscape', label: '城市' },
    { id: 'architecture', label: '建筑' },
    { id: 'minimalism', label: '极简' },
    { id: 'night', label: '夜' },
    { id: 'stars', label: '星空' },
    { id: 'cyberpunk', label: '赛博' },
    { id: 'abstract', label: '抽象' },
  ],
  anime: [
    { id: 'anime girls', label: '少女' },
    { id: 'scenery', label: '场景' },
    { id: 'sakura', label: '樱花' },
    { id: 'rain', label: '雨' },
    { id: 'cyberpunk', label: '赛博' },
    { id: 'minimalism', label: '极简' },
    { id: 'night', label: '夜' },
    { id: 'mecha', label: '机甲' },
    { id: 'pixel art', label: '像素' },
  ],
  people: [
    { id: 'portrait', label: '人像' },
    { id: 'woman', label: '女性' },
    { id: 'man', label: '男性' },
    { id: 'street', label: '街头' },
    { id: 'fashion', label: '时尚' },
    { id: 'model', label: '模特' },
    { id: 'cityscape', label: '城市' },
    { id: 'night', label: '夜' },
    { id: 'close-up', label: '特写' },
  ],
};

const CATEGORY_ORDER: CategoryKey[] = ['general', 'anime', 'people'];

/** 当前开着的分类对应的标签菜单。 */
export function visibleTagPresets(
  categories: Settings['wallhavenCategories'] | null | undefined,
): TagPreset[] {
  const c = { ...DEFAULT_SETTINGS.wallhavenCategories, ...categories };
  const seen = new Set<string>();
  const out: TagPreset[] = [];
  for (const key of CATEGORY_ORDER) {
    if (!c[key]) continue;
    for (const tag of WALLHAVEN_TAG_PRESETS[key]) {
      if (seen.has(tag.id)) continue;
      seen.add(tag.id);
      out.push(tag);
    }
  }
  return out;
}

/** 关掉某类之后，去掉菜单里已经没有的已选标签。 */
export function tagsAfterCategoriesChange(
  tags: string[],
  categories: Settings['wallhavenCategories'],
): string[] {
  const allowed = new Set(visibleTagPresets(categories).map((t) => t.id));
  return tags.filter((id) => allowed.has(id));
}

export type FilterAction =
  | { type: 'purity'; key: PurityKey; on: boolean }
  | { type: 'category'; key: CategoryKey; on: boolean }
  | { type: 'tag'; id: string; on: boolean }
  | { type: 'sorting'; value: WallhavenSorting }
  | { type: 'setKey'; value: string };

export type FilterResult = {
  settings: Settings;
  notice?: string;
  invalidatePool: boolean;
};

/** 尺度/分类按字段比，避免键序让 JSON.stringify 误判；排序缺省跟 DEFAULT，标签仍按序列化比。 */
function filterQueryChanged(prev: Settings, next: Settings): boolean {
  const p = prev.wallhavenPurity;
  const n = next.wallhavenPurity;
  const pc = prev.wallhavenCategories;
  const nc = next.wallhavenCategories;
  return (
    p.sfw !== n.sfw ||
    p.sketchy !== n.sketchy ||
    p.nsfw !== n.nsfw ||
    pc.general !== nc.general ||
    pc.anime !== nc.anime ||
    pc.people !== nc.people ||
    (prev.wallhavenSorting || DEFAULT_SETTINGS.wallhavenSorting) !==
      (next.wallhavenSorting || DEFAULT_SETTINGS.wallhavenSorting) ||
    JSON.stringify(prev.wallhavenTags ?? []) !== JSON.stringify(next.wallhavenTags ?? [])
  );
}

function withPoolFlag(prev: Settings, next: Settings): FilterResult {
  if (!filterQueryChanged(prev, next)) return { settings: prev, invalidatePool: false };
  return { settings: next, invalidatePool: true };
}

/**
 * 一次壁纸筛选控件操作收成新设置。小弹窗只展示 notice 并回写。
 * @param settings 当前设置
 * @param action 尺度 / 分类 / 标签 / 排序 / 密钥
 * @returns 关最后一项尺度或分类时 settings 原样，notice 为「尺度至少开一项」/「分类至少开一项」，invalidatePool 为 false。
 *   没密钥开「少儿不宜」与 `togglePurity` 一样无效。改分类会丢掉当前菜单里没有的已选标签；标签因此空了且正停在「相关」则落到默认排序。
 *   从零勾上第一个标签时，随机 / 最新改到相关；热门、浏览、收藏不改。
 *   invalidatePool 仅当尺度 / 分类 / 排序 / 标签真的变了（清空密钥若因此关了「少儿不宜」也算）。
 */
export function applyFilter(settings: Settings, action: FilterAction): FilterResult {
  switch (action.type) {
    case 'purity': {
      if (isTurningOffLast(settings.wallhavenPurity, action.key, action.on)) {
        return { settings, notice: '尺度至少开一项', invalidatePool: false };
      }
      const wallhavenPurity = togglePurity(
        settings.wallhavenPurity,
        action.key,
        action.on,
        (settings.wallhavenApiKey ?? '').trim().length > 0,
      );
      return withPoolFlag(settings, { ...settings, wallhavenPurity });
    }
    case 'category': {
      if (isTurningOffLast(settings.wallhavenCategories, action.key, action.on)) {
        return { settings, notice: '分类至少开一项', invalidatePool: false };
      }
      const wallhavenCategories = toggleCategory(
        settings.wallhavenCategories,
        action.key,
        action.on,
      );
      const wallhavenTags = tagsAfterCategoriesChange(settings.wallhavenTags ?? [], wallhavenCategories);
      return withPoolFlag(settings, {
        ...settings,
        wallhavenCategories,
        wallhavenTags,
        wallhavenSorting: sortingForTagSet(
          settings.wallhavenSorting,
          wallhavenTags,
          settings.wallhavenTags ?? [],
        ),
      });
    }
    case 'tag': {
      const cur = settings.wallhavenTags ?? [];
      const wallhavenTags = action.on
        ? cur.includes(action.id)
          ? cur
          : [...cur, action.id]
        : cur.filter((t) => t !== action.id);
      return withPoolFlag(settings, {
        ...settings,
        wallhavenTags,
        wallhavenSorting: sortingForTagSet(settings.wallhavenSorting, wallhavenTags, cur),
      });
    }
    case 'sorting':
      return withPoolFlag(settings, {
        ...settings,
        wallhavenSorting: sortingForTagSet(action.value, settings.wallhavenTags ?? []),
      });
    case 'setKey': {
      const nextHas = action.value.trim().length > 0;
      const next = {
        ...settings,
        wallhavenApiKey: action.value,
        wallhavenPurity: nextHas
          ? settings.wallhavenPurity
          : purityAfterClearingKey(settings.wallhavenPurity),
        wallhavenKeyOk: false,
      };
      return { settings: next, invalidatePool: filterQueryChanged(settings, next) };
    }
  }
}
