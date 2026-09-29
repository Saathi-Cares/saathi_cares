'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { BookOpen, GraduationCap, Heart, Sparkles, Stethoscope, Users, type LucideIcon } from 'lucide-react';
import type { ProgramsContent } from '@/content/site';

const iconMap: Record<string, LucideIcon> = { Stethoscope, BookOpen, Users, Sparkles, Heart, GraduationCap };
const colorCycle = ['teal', 'coral', 'sand', 'teal'] as const;
const colorStyles = {
  teal: { bg: 'bg-teal-50', iconBg: 'bg-primary', iconColor: 'text-primary-foreground' },
  coral: { bg: 'bg-coral-50', iconBg: 'bg-accent', iconColor: 'text-accent-foreground' },
  sand: { bg: 'bg-sand-100', iconBg: 'bg-foreground', iconColor: 'text-background' },
};

export function Programs({ content }: { content: ProgramsContent }) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="programs" className="section-padding bg-secondary" ref={ref}>
      <div className="container-wide mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-sm font-medium text-primary uppercase tracking-wider">{content.badge}</span>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mt-3 mb-6">
            {content.title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{content.description}</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {content.programs.map((program, index) => {
            const color = colorCycle[index % colorCycle.length] ?? 'teal';
            const styles = colorStyles[color];
            const Icon = iconMap[program.icon] ?? Heart;
            return (
              <motion.div
                key={program.id}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.1 * index }}
                className={`${styles.bg} rounded-xl p-8 group hover:shadow-elevated transition-all duration-300`}
              >
                <div className="flex items-start gap-5">
                  <div
                    className={`w-14 h-14 rounded-xl ${styles.iconBg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className={`w-7 h-7 ${styles.iconColor}`} />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-semibold text-foreground mb-3">{program.title}</h3>
                    <p className="text-muted-foreground leading-relaxed mb-3">{program.description}</p>
                    {program.outcomes.length > 0 && (
                      <ul className="space-y-1">
                        {program.outcomes.map((o) => (
                          <li key={o} className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0" />
                            {o}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
