import { promises as fs } from 'fs';
import path from 'path';

export const DOCS_DIR = path.join(process.cwd(), 'docs');

export type DocMeta = {
  slug: string;
  fileName: string;
  title: string;
  kind: 'markdown' | 'sql';
};

function toTitle(fileName: string): string {
  if (fileName.toLowerCase() === 'readme.md') return 'Project Documentation';
  return fileName
    .replace(/\.(md|sql)$/i, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function getDocsMeta(): Promise<DocMeta[]> {
  const entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && /\.(md|sql)$/i.test(entry.name))
    .map((entry) => ({
      slug: entry.name.replace(/\.(md|sql)$/i, '').toLowerCase(),
      fileName: entry.name,
      title: toTitle(entry.name),
      kind: entry.name.toLowerCase().endsWith('.sql')
        ? ('sql' as const)
        : ('markdown' as const),
    }))
    .sort((a, b) => {
      if (a.fileName.toLowerCase() === 'readme.md') return -1;
      if (b.fileName.toLowerCase() === 'readme.md') return 1;
      return a.fileName.localeCompare(b.fileName);
    });
}

export async function getDocBySlug(slug: string) {
  const docs = await getDocsMeta();
  const doc = docs.find((item) => item.slug === slug.toLowerCase());
  if (!doc) return null;

  const content = await fs.readFile(path.join(DOCS_DIR, doc.fileName), 'utf8');
  return { ...doc, content };
}
