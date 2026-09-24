import { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Phone, Mail, Clock, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { contactFormSchema, type ContactFormData } from '@/lib/validations';
import { saveSubmission } from '@/lib/storage';
import { useCMS } from '@/hooks/useCMS';

const iconMap: Record<string, any> = { MapPin, Phone, Mail, Clock };

export default function Contact() {
  const { contact } = useCMS();
  const [formData, setFormData] = useState<ContactFormData>({ name: '', email: '', phone: '', subject: '', message: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const result = contactFormSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
      result.error.errors.forEach(err => { if (err.path[0]) fieldErrors[err.path[0] as keyof ContactFormData] = err.message; });
      setErrors(fieldErrors);
      return;
    }
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    saveSubmission({ name: result.data.name, email: result.data.email, phone: result.data.phone || '', subject: result.data.subject, message: result.data.message });
    setIsSubmitting(false);
    setIsSubmitted(true);
    setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof ContactFormData]) setErrors(prev => ({ ...prev, [name]: undefined }));
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <section className="pt-32 pb-16 bg-gradient-to-b from-primary/5 to-background">
        <div className="container-wide mx-auto px-6 md:px-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-3xl mx-auto">
            <span className="inline-block px-4 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium mb-6">{contact.badge}</span>
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground mb-6">{contact.title}</h1>
            <p className="text-lg text-muted-foreground leading-relaxed">{contact.description}</p>
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container-wide mx-auto px-6 md:px-12">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
              <div className="bg-card rounded-2xl p-8 md:p-10 shadow-soft border border-border">
                <h2 className="font-serif text-2xl md:text-3xl text-foreground mb-2">Send Us a Message</h2>
                <p className="text-muted-foreground mb-8">Fill out the form and we'll respond within 24-48 hours.</p>

                {isSubmitted ? (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-12">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6"><CheckCircle className="w-8 h-8 text-primary" /></div>
                    <h3 className="font-serif text-xl text-foreground mb-2">Message Sent!</h3>
                    <p className="text-muted-foreground mb-6">Thank you. We'll be in touch soon.</p>
                    <Button variant="outline" onClick={() => setIsSubmitted(false)}>Send Another Message</Button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">Full Name *</label>
                        <Input id="name" name="name" value={formData.name} onChange={handleChange} placeholder="Your name" className={`bg-background ${errors.name ? 'border-destructive' : ''}`} />
                        {errors.name && <p className="text-sm text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.name}</p>}
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">Email *</label>
                        <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="your@email.com" className={`bg-background ${errors.email ? 'border-destructive' : ''}`} />
                        {errors.email && <p className="text-sm text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.email}</p>}
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-2">Phone</label>
                        <Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} placeholder="+91 98765 43210" className={`bg-background ${errors.phone ? 'border-destructive' : ''}`} />
                        {errors.phone && <p className="text-sm text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.phone}</p>}
                      </div>
                      <div>
                        <label htmlFor="subject" className="block text-sm font-medium text-foreground mb-2">Subject *</label>
                        <Input id="subject" name="subject" value={formData.subject} onChange={handleChange} placeholder="How can we help?" className={`bg-background ${errors.subject ? 'border-destructive' : ''}`} />
                        {errors.subject && <p className="text-sm text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.subject}</p>}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="message" className="block text-sm font-medium text-foreground mb-2">Message *</label>
                      <Textarea id="message" name="message" rows={5} value={formData.message} onChange={handleChange} placeholder="Tell us more..." className={`bg-background resize-none ${errors.message ? 'border-destructive' : ''}`} />
                      {errors.message && <p className="text-sm text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.message}</p>}
                    </div>
                    <Button type="submit" size="lg" disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                      {isSubmitting ? 'Sending...' : <><Send className="w-4 h-4 mr-2" />Send Message</>}
                    </Button>
                  </form>
                )}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="space-y-8">
              <div className="grid sm:grid-cols-2 gap-6">
                {contact.contactInfo.map((item, index) => {
                  const Icon = iconMap[item.icon] || Mail;
                  return (
                    <div key={index} className="bg-card rounded-xl p-6 border border-border hover:shadow-soft transition-shadow">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4"><Icon className="w-6 h-6 text-primary" /></div>
                      <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                      {item.details.map((detail, i) => <p key={i} className="text-sm text-muted-foreground">{detail}</p>)}
                    </div>
                  );
                })}
              </div>

              <div className="bg-card rounded-2xl p-8 border border-border">
                <h3 className="font-serif text-xl text-foreground mb-4">Areas of Operation</h3>
                <p className="text-muted-foreground mb-6">Our programs reach communities across multiple states.</p>
                <div className="flex flex-wrap gap-2">
                  {contact.operationAreas.map((area, index) => (
                    <span key={index} className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm">
                      <MapPin className="w-3 h-3" />{area.name}<span className="text-xs opacity-70">({area.districts} districts)</span>
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
