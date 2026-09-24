import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Linkedin } from 'lucide-react';
import { useCMS } from '@/hooks/useCMS';

export function Team() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const { team } = useCMS();

  return (
    <section id="team" className="section-padding" ref={ref}>
      <div className="container-wide mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="text-sm font-medium text-primary uppercase tracking-wider">
            {team.badge}
          </span>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mt-3 mb-6">
            {team.title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {team.description}
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
          {team.members.map((member, index) => (
            <motion.div
              key={member.id}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 * index }}
              className="bg-card rounded-xl p-6 md:p-8 shadow-card text-center group hover:shadow-elevated transition-all duration-300"
            >
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-full gradient-hero flex items-center justify-center mx-auto mb-6 group-hover:scale-105 transition-transform duration-300">
                <span className="text-xl md:text-2xl font-serif font-bold text-primary-foreground">
                  {member.initials}
                </span>
              </div>

              <span className="inline-block bg-teal-50 text-primary text-xs font-medium px-3 py-1 rounded-full mb-4">
                {member.role}
              </span>

              <h3 className="font-serif text-lg md:text-xl font-semibold text-foreground mb-2">
                {member.name}
              </h3>
              <p className="text-muted-foreground text-sm md:text-base mb-3">
                {member.title}
              </p>
              <p className="text-sm text-muted-foreground/80 mb-4">
                {member.credentials}
              </p>
              
              {member.linkedin && (
                <a
                  href={member.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-300 hover:scale-110"
                  aria-label={`${member.name}'s LinkedIn profile`}
                >
                  <Linkedin className="w-5 h-5" />
                </a>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
