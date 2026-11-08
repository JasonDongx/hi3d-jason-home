import type { Entry, Route, Section, SiteContent } from './hi3d-types';
const sections = ['about', 'writing', 'projects', 'collection'];
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
export function safeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try { const u = new URL(value); return ['https:', 'http:', 'mailto:'].includes(u.protocol) ? u.href : undefined; }
  catch { return undefined; }
}
export function validateContent(raw: unknown): SiteContent {
  if (!isRecord(raw) || raw.schemaVersion !== 2 || typeof raw.sample !== 'boolean' || !isRecord(raw.site) || !isRecord(raw.profile) || !isRecord(raw.navigation) || !Array.isArray(raw.entries)) throw new Error('内容格式不正确，请检查 hi3d-content.json。');
  const { site, profile, navigation } = raw;
  if (![site.title, site.description, profile.name, profile.tagline].every(v => typeof v === 'string') || !strings(profile.bio) || !strings(profile.interests) || !sections.every(s => typeof navigation[s] === 'string' && String(navigation[s]).trim())) throw new Error('网站名称、个人介绍或栏目名称未填写完整。');
  if (!Array.isArray(profile.links) || !profile.links.every(v => isRecord(v) && typeof v.label === 'string' && typeof v.url === 'string' && safeUrl(v.url))) throw new Error('联系方式格式不正确。');
  const ids = new Set<string>();
  for (const item of raw.entries) {
    if (!isRecord(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(item.id) || ids.has(item.id) || !sections.slice(1).includes(String(item.section)) || typeof item.title !== 'string' || typeof item.summary !== 'string' || !strings(item.body)) throw new Error('内容条目格式不正确，请检查唯一 ID、栏目、标题、摘要和正文。');
    if (item.date !== undefined && (typeof item.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Date.parse(item.date)) || new Date(item.date).toISOString().slice(0, 10) !== item.date)) throw new Error('日期需要是有效的 YYYY-MM-DD。');
    if (item.tag !== undefined && typeof item.tag !== 'string') throw new Error('标签需要是文本。');
    if (item.url !== undefined && (typeof item.url !== 'string' || !safeUrl(item.url))) throw new Error('链接地址不正确。');
    ids.add(item.id);
  }
  return raw as unknown as SiteContent;
}
export async function loadContent(signal?: AbortSignal): Promise<SiteContent> {
  const response = await fetch('./hi3d-content.json', { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`内容加载失败（HTTP ${response.status}）。`);
  return validateContent(await response.json());
}
export function parseRoute(hash: string): Route {
  const [section, id] = hash.replace(/^#\/?/, '').split('/');
  if (!sections.includes(section)) return { section: null, entryId: null };
  let entryId: string | null = null;
  try { entryId = id ? decodeURIComponent(id) : null; } catch { entryId = null; }
  return { section: section as Section, entryId: section === 'about' ? null : entryId };
}
export const entryHash = (entry: Entry) => `#${entry.section}/${encodeURIComponent(entry.id)}`;
export const dateText = (date?: string) => date ? date.replaceAll('-', '.') : '';
