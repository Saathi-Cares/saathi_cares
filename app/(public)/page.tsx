import { siteContent } from '@/content/site';
import { About } from '@/components/sections/About';
import { CTA } from '@/components/sections/CTA';
import { Hero } from '@/components/sections/Hero';
import { Impact } from '@/components/sections/Impact';
import { Problem } from '@/components/sections/Problem';
import { Programs } from '@/components/sections/Programs';
import { Team } from '@/components/sections/Team';

export default function HomePage() {
  return (
    <>
      <Hero content={siteContent.hero} />
      <Problem />
      <About content={siteContent.about} />
      <Programs content={siteContent.programs} />
      <Impact content={siteContent.impact} />
      <Team content={siteContent.team} />
      <CTA content={siteContent.cta} />
    </>
  );
}
