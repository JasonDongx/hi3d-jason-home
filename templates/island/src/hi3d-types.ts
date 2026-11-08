export type Section = 'about' | 'writing' | 'projects' | 'collection';
export type ContentSection = Exclude<Section, 'about'>;
export interface Entry {
  id: string;
  section: ContentSection;
  title: string;
  summary: string;
  body: string[];
  date?: string;
  tag?: string;
  url?: string;
}
export interface SiteContent {
  schemaVersion: 2;
  sample: boolean;
  site: { title: string; description: string };
  navigation: Record<Section, string>;
  profile: { name: string; tagline: string; bio: string[]; interests: string[]; links: { label: string; url: string }[] };
  entries: Entry[];
}
export interface OceanConfig {
  waterLevel: number;
  coastMap: string;
  extent: number;
  distanceRange: number;
  speed: number;
  deepColor: string;
  midColor: string;
  shallowColor: string;
}
export interface SceneConfig {
  islandUrl: string;
  boyUrl: string;
  islandWidth: number;
  islandRotation: [number, number, number];
  boyHeight: number;
  boyPosition: [number, number, number];
  boyGroundY?: number;
  boyRotation: [number, number, number];
  anchors: Record<Section, [number, number, number]>;
  ocean: OceanConfig;
}
export interface Route { section: Section | null; entryId: string | null }
