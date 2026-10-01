import { Heart } from 'lucide-react';
import type { ImpactContent } from '@/content/site';
import { Enter } from './Enter';

export function Impact({ content }: { content: ImpactContent }) {
  return (
    <section id="impact" className="section-padding scroll-mt-20 gradient-hero text-primary-foreground">
      <div className="container-wide mx-auto">
        <Enter className="text-center mb-16">
          <span className="text-sm font-medium text-primary-foreground/80 uppercase tracking-wider">
            {content.badge}
          </span>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl mt-3 mb-6">{content.title}</h2>
          <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto">{content.description}</p>
        </Enter>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {content.stats.map((stat, index) => (
            <Enter
              key={stat.id}
              delay={index * 100}
              className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-8 text-center border border-primary-foreground/20"
            >
              <div className="w-14 h-14 rounded-full bg-primary-foreground/20 flex items-center justify-center mx-auto mb-4">
                <Heart className="w-7 h-7 text-primary-foreground" />
              </div>
              <div className="font-serif text-4xl font-bold mb-2">{stat.value}</div>
              <div className="font-medium text-lg mb-2">{stat.label}</div>
              <p className="text-sm text-primary-foreground/70">{stat.description}</p>
            </Enter>
          ))}
        </div>
      </div>
    </section>
  );
}
