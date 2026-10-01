import type { ProblemContent } from '@/content/site';
import { Enter } from './Enter';
import { problemIcons } from './icons';

export function Problem({ content }: { content: ProblemContent }) {
  return (
    <section className="section-padding bg-secondary">
      <div className="container-wide mx-auto">
        <Enter className="text-center mb-16">
          <span className="text-sm font-medium text-primary uppercase tracking-wider">{content.badge}</span>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mt-3 mb-6">
            {content.heading}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{content.description}</p>
        </Enter>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {content.stats.map((stat, index) => {
            const Icon = problemIcons[stat.icon];
            return (
              <Enter
                key={stat.id}
                delay={index * 100}
                className="bg-card rounded-xl p-8 shadow-card text-center group hover:shadow-elevated transition-shadow duration-300"
              >
                <div className="w-14 h-14 rounded-full bg-coral-50 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Icon className="w-7 h-7 text-accent" />
                </div>
                <div className="font-serif text-4xl font-bold text-primary mb-2">{stat.value}</div>
                <div className="font-medium text-foreground mb-2">{stat.label}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{stat.description}</p>
              </Enter>
            );
          })}
        </div>

        <Enter delay={500} className="mt-12 bg-coral-50 rounded-xl p-8 md:p-12 text-center">
          <blockquote>
            <p className="text-lg md:text-xl text-foreground italic max-w-3xl mx-auto">
              &ldquo;{content.quote.text}&rdquo;
            </p>
          </blockquote>
          <p className="text-sm font-medium text-muted-foreground mt-4">— {content.quote.author}</p>
        </Enter>
      </div>
    </section>
  );
}
