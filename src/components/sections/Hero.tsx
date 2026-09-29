import { motion } from 'framer-motion';
import { ArrowRight, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCMS } from '@/hooks/useCMS';
import heroImage from '@/assets/hero-dental-camp.jpg';

export function Hero() {
  const { hero } = useCMS();

  return (
    <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="Dental health camp serving rural communities"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/70 to-primary/50" />
      </div>

      <div className="relative z-10 container-wide mx-auto px-6 md:px-12 py-32">
        <div className="max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6"
          >
            <Heart className="w-4 h-4 text-coral-500" />
            <span className="text-sm font-medium text-primary-foreground">{hero.badge}</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-4xl md:text-5xl lg:text-6xl text-primary-foreground leading-tight mb-6"
          >
            {hero.title} <span className="text-coral-500">{hero.highlight}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-primary-foreground/90 leading-relaxed mb-8 max-w-2xl"
          >
            {hero.description}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <Link to="/donate">
              <Button
                size="lg"
                className="bg-accent hover:bg-coral-600 text-accent-foreground font-medium px-8 py-6 text-lg"
              >
                {hero.primaryCta}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <a href="#about">
              <Button
                size="lg"
                variant="outline"
                className="border-primary-foreground/50 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 font-medium px-8 py-6 text-lg"
              >
                {hero.secondaryCta}
              </Button>
            </a>
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="w-6 h-10 border-2 border-primary-foreground/30 rounded-full flex justify-center pt-2">
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1.5 h-1.5 bg-primary-foreground/60 rounded-full"
          />
        </div>
      </motion.div>
    </section>
  );
}
