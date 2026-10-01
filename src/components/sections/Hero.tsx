import { ArrowRight, Heart } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { HeroContent } from '@/content/site';
import heroImage from '@/assets/hero-dental-camp.jpg';

// Server component. The entrance animation is CSS (tailwindcss-animate), so the hero paints with the
// HTML instead of waiting for hydration. The heading and paragraph slide in without
// fading: the paragraph is the page's LCP element, and Chrome drops LCP candidates first painted at opacity 0.
const slideIn = 'animate-in slide-in-from-bottom-5 duration-700 fill-mode-both motion-reduce:animate-none';
const enter = `${slideIn} fade-in`;

export function Hero({ content }: { content: HeroContent }) {
  return (
    <section
      id="home"
      className="scroll-mt-20 relative min-h-screen flex items-center justify-center overflow-hidden"
    >
      {/* `absolute` is a positioned container, which is what next/image `fill` requires. */}
      <div className="absolute inset-0">
        <Image
          src={heroImage}
          alt="Dental health camp serving rural communities"
          fill
          priority
          sizes="100vw"
          placeholder="blur"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/70 to-primary/50" />
      </div>

      <div className="relative z-10 container-wide mx-auto px-6 md:px-12 py-32">
        <div className="max-w-3xl">
          <div
            className={`${enter} inline-flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-4 py-2 mb-6`}
          >
            <Heart className="w-4 h-4 text-coral-500" />
            <span className="text-sm font-medium text-primary-foreground">{content.badge}</span>
          </div>

          <h1
            className={`${slideIn} delay-100 font-serif text-4xl md:text-5xl lg:text-6xl text-primary-foreground leading-tight mb-6`}
          >
            {content.title} <span className="text-coral-500">{content.highlight}</span>
          </h1>

          <p
            className={`${slideIn} delay-200 text-lg md:text-xl text-primary-foreground/90 leading-relaxed mb-8 max-w-2xl`}
          >
            {content.description}
          </p>

          <div className={`${enter} delay-300 flex flex-col sm:flex-row gap-4`}>
            <Button
              asChild
              size="lg"
              className="bg-accent hover:bg-coral-600 text-accent-foreground font-medium px-8 py-6 text-lg"
            >
              <Link href="/donate">
                {content.primaryCta}
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/50 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 font-medium px-8 py-6 text-lg"
            >
              <a href="#about">{content.secondaryCta}</a>
            </Button>
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-in fade-in duration-500 delay-1000 fill-mode-both motion-reduce:animate-none"
        aria-hidden="true"
      >
        <div className="w-6 h-10 border-2 border-primary-foreground/30 rounded-full flex justify-center pt-2">
          <div className="w-1.5 h-1.5 bg-primary-foreground/60 rounded-full animate-bounce motion-reduce:animate-none" />
        </div>
      </div>
    </section>
  );
}
