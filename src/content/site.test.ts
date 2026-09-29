import { describe, expect, it } from 'vitest';
import { siteContent } from './site';

describe('siteContent', () => {
  it('has the sections the home page renders', () => {
    expect(siteContent.hero.title.length).toBeGreaterThan(0);
    expect(siteContent.programs.programs.length).toBeGreaterThanOrEqual(3);
    expect(siteContent.impact.stats.length).toBe(4);
    expect(siteContent.team.members.length).toBeGreaterThan(0);
    expect(siteContent.contact.contactInfo.length).toBeGreaterThan(0);
  });
});
