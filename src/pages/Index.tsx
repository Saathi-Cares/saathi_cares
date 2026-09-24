import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Hero } from '@/components/sections/Hero';
import { Problem } from '@/components/sections/Problem';
import { About } from '@/components/sections/About';
import { Programs } from '@/components/sections/Programs';
import { Impact } from '@/components/sections/Impact';
import { Team } from '@/components/sections/Team';
import { CTA } from '@/components/sections/CTA';

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <Problem />
        <About />
        <Programs />
        <Impact />
        <Team />
        <CTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
