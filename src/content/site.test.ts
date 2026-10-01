import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { navLinks, org, siteContent } from './site';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const homePage = read('app/(public)/page.tsx');

// The section components the home page renders, from its `@/components/sections/X` imports.
const sectionFiles = [...homePage.matchAll(/from '@\/components\/sections\/(\w+)'/g)].map(
  ([, name]) => `src/components/sections/${name}.tsx`,
);
const sectionIds = sectionFiles.flatMap((file) =>
  [...read(file).matchAll(/<section\s+id="([\w-]+)"/g)].map(([, id]) => id),
);

describe('site content and the home page', () => {
  it('has a content entry for every siteContent section the home page reads', () => {
    const used = [...homePage.matchAll(/siteContent\.(\w+)/g)].map(([, key]) => key);
    expect(used.length).toBeGreaterThan(0);
    for (const key of used) expect(siteContent).toHaveProperty(key as string);
  });

  it('renders section components that exist', () => {
    expect(sectionFiles.length).toBeGreaterThan(0);
    for (const file of sectionFiles) expect(existsSync(path.join(root, file)), file).toBe(true);
  });

  it('points every home-page nav link at a section id, offset for the fixed header', () => {
    const anchors = navLinks.filter((link) => link.href.startsWith('/#')).map((link) => link.href.slice(2));
    expect(anchors.length).toBeGreaterThan(0);
    for (const id of anchors) expect(sectionIds, `#${id}`).toContain(id);
    for (const file of sectionFiles) {
      for (const [tag] of read(file).matchAll(/<section\s+id="[\w-]+"[^>]*>/g)) {
        expect(tag, file).toContain('scroll-mt-20');
      }
    }
  });

  it('points every route nav link at a page that exists', () => {
    for (const link of navLinks.filter((l) => !l.href.startsWith('/#'))) {
      expect(existsSync(path.join(root, 'app/(public)', link.href, 'page.tsx')), link.href).toBe(true);
    }
  });

  it('publishes a valid email address and no phone number', () => {
    expect(org.email).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i);
    expect(JSON.stringify({ org, siteContent })).not.toMatch(/\+91|\d{5}\s\d{5}/);
  });
});
