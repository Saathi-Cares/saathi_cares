import type { Metadata } from 'next';
import { org, siteContent } from '@/content/site';
import { pageMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = pageMetadata({
  title: 'Contact',
  description: `How to reach ${org.name}: email, office address and the states where we work.`,
  path: '/contact',
});

export default function ContactPage() {
  const { contact } = siteContent;
  return (
    <section className="container mx-auto px-6 py-24">
      <p className="text-sm font-medium text-accent">{contact.badge}</p>
      <h1 className="font-serif text-4xl mt-2">{contact.title}</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">{contact.description}</p>
      <dl className="mt-12 grid gap-8 sm:grid-cols-2">
        <div>
          <dt className="font-medium">Office Address</dt>
          <dd className="text-muted-foreground">
            <address className="not-italic">
              {org.address.lines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
          </dd>
        </div>
        <div>
          <dt className="font-medium">Email</dt>
          <dd>
            <a href={`mailto:${org.email}`} className="text-primary underline break-all">
              {org.email}
            </a>
          </dd>
        </div>
        {contact.contactInfo.map((item) => (
          <div key={item.title}>
            <dt className="font-medium">{item.title}</dt>
            {item.details.map((line) => (
              <dd key={line} className="text-muted-foreground">
                {line}
              </dd>
            ))}
          </div>
        ))}
      </dl>
      <h2 className="font-serif text-2xl mt-16">Where we work</h2>
      <ul className="mt-4 flex flex-wrap gap-3">
        {contact.operationAreas.map((area) => (
          <li key={area.name} className="rounded-full bg-secondary px-4 py-1 text-sm">
            {area.name} · {area.districts} districts
          </li>
        ))}
      </ul>
    </section>
  );
}
