import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { MapPin, Users, Heart, Smile } from 'lucide-react';
import { useCMS } from '@/hooks/useCMS';

const iconMap: Record<string, any> = { MapPin, Users, Heart, Smile };

export function Impact() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const { impact } = useCMS();

  return (
    <section id="impact" className="section-padding gradient-hero text-primary-foreground" ref={ref}>
      <div className="container-wide mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6 }} className="text-center mb-16">
          <span className="text-sm font-medium text-primary-foreground/80 uppercase tracking-wider">{impact.badge}</span>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl mt-3 mb-6">{impact.title}</h2>
          <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto">{impact.description}</p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {impact.stats.map((stat, index) => (
            <motion.div key={stat.id} initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 * index }}
              className="bg-primary-foreground/10 backdrop-blur-sm rounded-xl p-8 text-center border border-primary-foreground/20">
              <div className="w-14 h-14 rounded-full bg-primary-foreground/20 flex items-center justify-center mx-auto mb-4">
                <Heart className="w-7 h-7 text-primary-foreground" />
              </div>
              <div className="font-serif text-4xl font-bold mb-2">{stat.value}</div>
              <div className="font-medium text-lg mb-2">{stat.label}</div>
              <p className="text-sm text-primary-foreground/70">{stat.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
