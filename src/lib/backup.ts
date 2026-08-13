import JSZip from 'jszip';
import { stripLocalIcons } from './iconPersist';
import type { YtabState } from './types';

const META_NAME = 'ytab.json';
const ICONS_DIR = 'icons/';

export type ExportOptions = {
  includeIcons: boolean;
  includeApiKey: boolean;
};

/**
 * 导出 `.ytab` ZIP。
 * `$state` 代理不能 `structuredClone`，用 JSON 深拷贝。
 * 不含图标时（以及打包失败的残留）把本地引用改成站点 favicon，避免换机后无法解析。
 */
export async function exportYtab(
  state: YtabState,
  options: ExportOptions,
): Promise<Blob> {
  const zip = new JSZip();
  let clone: YtabState = JSON.parse(JSON.stringify(state)) as YtabState;

  if (!options.includeApiKey) {
    clone.settings.wallhavenApiKey = '';
    clone.settings.wallhavenKeyOk = false;
  }

  const iconMap: Record<string, string> = {};

  if (options.includeIcons) {
    for (const page of clone.pages) {
      for (const item of page) {
        if (item.kind === 'app') {
          await packIcon(zip, item.id, item.icon, iconMap);
          if (iconMap[item.id]) item.icon = `icon:${item.id}`;
        } else {
          for (const child of item.children) {
            await packIcon(zip, child.id, child.icon, iconMap);
            if (iconMap[child.id]) child.icon = `icon:${child.id}`;
          }
        }
      }
    }
  }
  clone = stripLocalIcons(clone, options.includeIcons);

  zip.file(
    META_NAME,
    JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        state: clone,
      },
      null,
      2,
    ),
  );

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

async function packIcon(
  zip: JSZip,
  id: string,
  icon: string,
  iconMap: Record<string, string>,
): Promise<void> {
  if (!icon || icon.startsWith('icon:')) return;
  try {
    if (icon.startsWith('data:')) {
      const comma = icon.indexOf(',');
      const header = icon.slice(5, comma);
      const data = icon.slice(comma + 1);
      const isBase64 = header.includes('base64');
      const ext = extFromMime(header) ?? 'bin';
      const path = `${ICONS_DIR}${id}.${ext}`;
      zip.file(path, data, { base64: isBase64 });
      iconMap[id] = path;
      return;
    }
    if (icon.startsWith('http')) {
      const res = await fetch(icon);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const ext = guessExt(res.headers.get('content-type'), icon);
      const path = `${ICONS_DIR}${id}.${ext}`;
      zip.file(path, buf);
      iconMap[id] = path;
    }
  } catch {
    // skip failed icons
  }
}

function extFromMime(header: string): string | null {
  if (header.includes('png')) return 'png';
  if (header.includes('jpeg') || header.includes('jpg')) return 'jpg';
  if (header.includes('webp')) return 'webp';
  if (header.includes('svg')) return 'svg';
  return null;
}

function guessExt(mime: string | null, url: string): string {
  if (mime?.includes('png')) return 'png';
  if (mime?.includes('jpeg') || mime?.includes('jpg')) return 'jpg';
  if (mime?.includes('webp')) return 'webp';
  if (mime?.includes('svg')) return 'svg';
  const m = url.match(/\.(png|jpe?g|webp|svg)(\?|$)/i);
  return m?.[1]?.toLowerCase().replace('jpeg', 'jpg') ?? 'png';
}

export async function importYtab(file: Blob): Promise<YtabState> {
  const zip = await JSZip.loadAsync(file);
  const metaFile = zip.file(META_NAME);
  if (!metaFile) throw new Error('无效的 .ytab：缺少 ytab.json');

  const meta = JSON.parse(await metaFile.async('string')) as {
    state: YtabState;
  };
  const state = meta.state;
  if (!state?.settings || !state.pages) {
    throw new Error('无效的 .ytab：状态损坏');
  }

  for (const page of state.pages) {
    for (const item of page) {
      if (item.kind === 'app') {
        item.icon = await resolveIcon(zip, item.icon);
      } else {
        for (const child of item.children) {
          child.icon = await resolveIcon(zip, child.icon);
        }
      }
    }
  }

  return state;
}

async function resolveIcon(zip: JSZip, icon: string): Promise<string> {
  if (!icon.startsWith('icon:')) return icon;
  const id = icon.slice(5);
  const files = zip.file(new RegExp(`^${ICONS_DIR}${id}\\.`));
  const file = files[0];
  if (!file) return '';
  const buf = await file.async('arraybuffer');
  const ext = file.name.split('.').pop() ?? 'png';
  const mime =
    ext === 'svg'
      ? 'image/svg+xml'
      : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/png';
  const blob = new Blob([buf], { type: mime });
  return await blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
