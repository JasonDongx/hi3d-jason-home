import { Feather, UserRound, Shapes, Bookmark } from 'lucide-react';
import type { Section } from './hi3d-types';
export const sectionOrder: Section[] = ['about', 'writing', 'projects', 'collection'];
export const sections = {
  about: { icon: UserRound, hint: '认识一下', en: 'ABOUT', color: '#547854' },
  writing: { icon: Feather, hint: '一些文字', en: 'JOURNAL', color: '#53765e' },
  projects: { icon: Shapes, hint: '做过的事情', en: 'PROJECTS', color: '#a1804f' },
  collection: { icon: Bookmark, hint: '喜欢的发现', en: 'COLLECTION', color: '#72816d' }
} as const;
export function LeafMark() {
  return <span className="leaf-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M12 28C8 15 20 7 32 8c0 15-8 25-20 20Z" fill="currentColor"/><path d="m10 32 17-19M18 24l-1-8M18 24l8-1" stroke="#f6f7ec" strokeWidth="1.5" strokeLinecap="round"/></svg></span>;
}
