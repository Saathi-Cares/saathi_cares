import { Eye, Target } from 'lucide-react';
import type { AboutContent } from '@/content/site';

export function About({ content }: { content: AboutContent }) {
  return (
    <section id="about" className="section-padding">
      <div className="container-wide mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <div className="reveal">
              <span className="text-sm font-medium text-primary uppercase tracking-wider">
                {content.badge}
              </span>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mt-3 mb-8">
                {content.title}
              </h2>
            </div>
            <p
              className="reveal text-lg text-muted-foreground leading-relaxed mb-8"
              style={{ animationDelay: '100ms' }}
            >
              {content.description}
            </p>
          </div>

          <div className="space-y-6">
            <div
              className="reveal bg-teal-50 rounded-xl p-8 border-l-4 border-primary"
              style={{ animationDelay: '200ms' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                  <Eye className="w-5 h-5 text-primary-foreground" />
                </div>
                <h3 className="font-serif text-xl font-semibold text-foreground">Our Vision</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed">{content.vision}</p>
            </div>

            <div
              className="reveal bg-coral-50 rounded-xl p-8 border-l-4 border-accent"
              style={{ animationDelay: '300ms' }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                  <Target className="w-5 h-5 text-accent-foreground" />
                </div>
                <h3 className="font-serif text-xl font-semibold text-foreground">Our Mission</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed">{content.mission}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
