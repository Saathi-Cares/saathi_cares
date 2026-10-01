import { Eye, Target } from 'lucide-react';
import type { AboutContent } from '@/content/site';
import { Enter } from './Enter';

export function About({ content }: { content: AboutContent }) {
  return (
    <section id="about" className="section-padding scroll-mt-20">
      <div className="container-wide mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <Enter>
              <span className="text-sm font-medium text-primary uppercase tracking-wider">
                {content.badge}
              </span>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mt-3 mb-8">
                {content.title}
              </h2>
            </Enter>
            <Enter as="p" delay={100} className="text-lg text-muted-foreground leading-relaxed mb-8">
              {content.description}
            </Enter>
          </div>

          <div className="space-y-6">
            <Enter delay={200} className="bg-teal-50 rounded-xl p-8 border-l-4 border-primary">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                  <Eye className="w-5 h-5 text-primary-foreground" />
                </div>
                <h3 className="font-serif text-xl font-semibold text-foreground">Our Vision</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed">{content.vision}</p>
            </Enter>

            <Enter delay={300} className="bg-coral-50 rounded-xl p-8 border-l-4 border-accent">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                  <Target className="w-5 h-5 text-accent-foreground" />
                </div>
                <h3 className="font-serif text-xl font-semibold text-foreground">Our Mission</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed">{content.mission}</p>
            </Enter>
          </div>
        </div>
      </div>
    </section>
  );
}
