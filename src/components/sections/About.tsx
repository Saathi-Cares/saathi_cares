import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Eye, Target, Heart } from 'lucide-react';
import { useCMS } from '@/hooks/useCMS';

export function About() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const { about } = useCMS();

  return (
    <section id="about" className="section-padding" ref={ref}>
      <div className="container-wide mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }}>
              <span className="text-sm font-medium text-primary uppercase tracking-wider">{about.badge}</span>
              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mt-3 mb-8">
                {about.title}
              </h2>
            </motion.div>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: 0.1 }}
              className="text-lg text-muted-foreground leading-relaxed mb-8">{about.description}</motion.p>
          </div>

          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, x: 20 }} animate={isInView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-teal-50 rounded-xl p-8 border-l-4 border-primary">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center"><Eye className="w-5 h-5 text-primary-foreground" /></div>
                <h3 className="font-serif text-xl font-semibold text-foreground">Our Vision</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed">{about.vision}</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={isInView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.6, delay: 0.3 }}
              className="bg-coral-50 rounded-xl p-8 border-l-4 border-accent">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center"><Target className="w-5 h-5 text-accent-foreground" /></div>
                <h3 className="font-serif text-xl font-semibold text-foreground">Our Mission</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed">{about.mission}</p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
