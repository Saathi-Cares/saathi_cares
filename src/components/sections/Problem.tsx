import { AlertCircle, Users, Globe, Skull } from 'lucide-react';

const stats = [
  {
    icon: Globe,
    number: '3.5B',
    label: 'People affected by oral diseases worldwide',
  },
  {
    icon: Users,
    number: '50%',
    label: 'Of global population suffers from oral health issues',
  },
  {
    icon: AlertCircle,
    number: '27%',
    label: 'Of cancers in India linked to tobacco use',
  },
  {
    icon: Skull,
    number: '50%',
    label: 'Of oral cancer patients in India die within a year',
  },
];

export function Problem() {
  return (
    <section className="section-padding bg-secondary">
      <div className="container-wide mx-auto">
        <div className="reveal text-center mb-16">
          <span className="text-sm font-medium text-primary uppercase tracking-wider">The Challenge</span>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-foreground mt-3 mb-6">
            What Are We Solving?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Oral health is the mirror to general health. In a country of 1.3 billion, more than 90% of
            healthcare facilities are concentrated in urban areas, leaving rural communities underserved.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="reveal bg-card rounded-xl p-8 shadow-card text-center group hover:shadow-elevated transition-shadow duration-300"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="w-14 h-14 rounded-full bg-coral-50 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                <stat.icon className="w-7 h-7 text-accent" />
              </div>
              <div className="font-serif text-4xl font-bold text-primary mb-2">{stat.number}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{stat.label}</p>
            </div>
          ))}
        </div>

        <div
          className="reveal mt-12 bg-coral-50 rounded-xl p-8 md:p-12 text-center"
          style={{ animationDelay: '500ms' }}
        >
          <p className="text-lg md:text-xl text-foreground italic max-w-3xl mx-auto">
            &ldquo;Injustice anywhere is a threat to justice everywhere. We are caught in an inescapable
            network of mutuality, tied in a single garment of destiny.&rdquo;
          </p>
          <p className="text-sm font-medium text-muted-foreground mt-4">— Martin Luther King Jr.</p>
        </div>
      </div>
    </section>
  );
}
