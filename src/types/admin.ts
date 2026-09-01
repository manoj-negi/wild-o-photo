export interface MetaItem {
  key: string;
  value: string;
}

export interface AdminPhoto {
  slug: string;
  src: string;
  alt: string;
  cap: string;
  title: string;
  ref: string;
  category: string;
  collection: string;
  camera: string;
  date: string;
  live: boolean;
  about: string;
  altNote: string;
  l: string;
  t: string;
  w: string;
  h: string;
  views: string[];
  meta: MetaItem[];
}

export interface Category {
  title: string;
  parent: string;
  description: string;
}
