import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Heart, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCMS } from '@/hooks/useCMS';

export function CTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const { cta } = useCMS();

  return (
    <section className="section-padding bg-secondary" ref={ref}>
      <div className="container-narrow mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="bg-card rounded-2xl p-8 md:p-12 lg:p-16 shadow-elevated text-center"
        >
          <div className="w-16 h-16 rounded-full bg-coral-50 flex items-center justify-center mx-auto mb-6">
            <Heart className="w-8 h-8 text-accent" />
          </div>
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-4">{cta.title}</h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">{cta.description}</p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/donate">
              <Button
                size="lg"
                className="bg-accent hover:bg-coral-600 text-accent-foreground font-medium px-8"
              >
                <Heart className="w-5 h-5 mr-2" />
                {cta.primaryCta}
              </Button>
            </Link>
            <Link to="/contact">
              <Button
                size="lg"
                variant="outline"
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground font-medium px-8"
              >
                <Mail className="w-5 h-5 mr-2" />
                {cta.secondaryCta}
              </Button>
            </Link>
          </div>

          <div className="mt-8 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Have questions? Reach out at{' '}
              <a href="mailto:cares@saathiventures.com" className="text-primary font-medium hover:underline">
                cares@saathiventures.com
              </a>
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
