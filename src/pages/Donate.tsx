import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, CreditCard, Smartphone, Building, Wallet, ArrowRight, CheckCircle, Shield } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { initiateDonation, confirmDonation, getCampaigns, seedDonationData, type DonationMethod } from '@/lib/donations';
import { logAudit } from '@/lib/audit';
import { useCMS } from '@/hooks/useCMS';

const amounts = [500, 1000, 2500, 5000, 10000, 25000];
const methods: { value: DonationMethod; label: string; icon: typeof CreditCard }[] = [
  { value: 'upi', label: 'UPI', icon: Smartphone },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'netbanking', label: 'Net Banking', icon: Building },
  { value: 'wallet', label: 'Wallet', icon: Wallet },
];

export default function Donate() {
  seedDonationData();
  const campaigns = getCampaigns().filter(c => c.isActive);
  const { cta } = useCMS();
  
  const [step, setStep] = useState<'form' | 'processing' | 'success'>('form');
  const [selectedAmount, setSelectedAmount] = useState(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [method, setMethod] = useState<DonationMethod>('upi');
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', isAnonymous: false, campaignId: '' });

  const amount = customAmount ? parseInt(customAmount) : selectedAmount;

  const handleDonate = async () => {
    if (!form.name || !form.email || amount < 10) return;
    setStep('processing');

    const donation = initiateDonation({
      donorName: form.isAnonymous ? 'Anonymous' : form.name,
      donorEmail: form.email,
      donorPhone: form.phone,
      amount,
      method,
      campaignId: form.campaignId || undefined,
      isRecurring: false,
      isAnonymous: form.isAnonymous,
      message: form.message || undefined,
    });

    logAudit({ action: 'donation.initiate', domain: 'donation', actor: form.email, actorRole: 'donor', entityType: 'donation', entityId: donation.id, details: `₹${amount} via ${method}` });

    // Simulate payment processing
    await new Promise(r => setTimeout(r, 2000));
    confirmDonation(donation.id);
    logAudit({ action: 'donation.confirm', domain: 'donation', actor: 'system', actorRole: 'system', entityType: 'donation', entityId: donation.id, details: `₹${amount} confirmed` });

    setStep('success');
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <section className="pt-32 pb-16 bg-gradient-to-b from-primary/5 to-background">
        <div className="container-wide mx-auto px-6 md:px-12 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Badge className="bg-primary/10 text-primary mb-4">Support Our Mission</Badge>
            <h1 className="font-serif text-4xl md:text-5xl text-foreground mb-4">{cta.title}</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{cta.description}</p>
          </motion.div>
        </div>
      </section>

      <section className="py-16">
        <div className="container-narrow mx-auto px-6 md:px-12">
          {step === 'success' ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-card rounded-2xl p-12 text-center shadow-soft border border-border">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="font-serif text-3xl text-foreground mb-3">Thank You!</h2>
              <p className="text-muted-foreground mb-2">Your donation of {formatCurrency(amount)} has been received.</p>
              <p className="text-sm text-muted-foreground mb-8">A receipt has been sent to {form.email}</p>
              <div className="flex gap-4 justify-center">
                <Button onClick={() => { setStep('form'); setForm({ name: '', email: '', phone: '', message: '', isAnonymous: false, campaignId: '' }); }}>Donate Again</Button>
                <Button variant="outline" asChild><a href="/">Back to Home</a></Button>
              </div>
            </motion.div>
          ) : step === 'processing' ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-2xl p-12 text-center shadow-soft border border-border">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <h2 className="font-serif text-2xl text-foreground mb-2">Processing Payment...</h2>
              <p className="text-muted-foreground">Please wait while we confirm your donation.</p>
            </motion.div>
          ) : (
            <div className="grid lg:grid-cols-5 gap-8">
              <div className="lg:col-span-3">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-card rounded-2xl p-8 shadow-soft border border-border space-y-8">
                  {/* Amount */}
                  <div>
                    <h2 className="font-serif text-xl mb-4">Choose Amount</h2>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      {amounts.map(a => (
                        <button key={a} onClick={() => { setSelectedAmount(a); setCustomAmount(''); }}
                          className={`p-3 rounded-xl border-2 text-center font-semibold transition-all ${selectedAmount === a && !customAmount ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50'}`}>
                          {formatCurrency(a)}
                        </button>
                      ))}
                    </div>
                    <Input placeholder="Or enter custom amount (₹)" type="number" value={customAmount} onChange={e => setCustomAmount(e.target.value)} />
                  </div>

                  {/* Payment Method */}
                  <div>
                    <h2 className="font-serif text-xl mb-4">Payment Method</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {methods.map(m => (
                        <button key={m.value} onClick={() => setMethod(m.value)}
                          className={`p-3 rounded-xl border-2 text-center transition-all ${method === m.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                          <m.icon className="w-5 h-5 mx-auto mb-1" />
                          <span className="text-sm font-medium">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Campaign */}
                  {campaigns.length > 0 && (
                    <div>
                      <h2 className="font-serif text-xl mb-4">Donate To</h2>
                      <div className="space-y-2">
                        <button onClick={() => setForm(f => ({ ...f, campaignId: '' }))}
                          className={`w-full text-left p-3 rounded-xl border-2 transition-all ${!form.campaignId ? 'border-primary bg-primary/5' : 'border-border'}`}>
                          <span className="font-medium">General Fund</span>
                        </button>
                        {campaigns.map(c => (
                          <button key={c.id} onClick={() => setForm(f => ({ ...f, campaignId: c.id }))}
                            className={`w-full text-left p-3 rounded-xl border-2 transition-all ${form.campaignId === c.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                            <span className="font-medium">{c.title}</span>
                            <span className="text-xs text-muted-foreground ml-2">{Math.round((c.raisedAmount / c.goalAmount) * 100)}% funded</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Donor Info */}
                  <div>
                    <h2 className="font-serif text-xl mb-4">Your Information</h2>
                    <div className="space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div><label className="text-sm font-medium">Full Name *</label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your name" /></div>
                        <div><label className="text-sm font-medium">Email *</label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" /></div>
                      </div>
                      <div><label className="text-sm font-medium">Phone</label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" /></div>
                      <div><label className="text-sm font-medium">Message (optional)</label><Textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Leave a message..." rows={2} /></div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.isAnonymous} onChange={e => setForm(f => ({ ...f, isAnonymous: e.target.checked }))} className="rounded" />
                        <span className="text-sm">Make my donation anonymous</span>
                      </label>
                    </div>
                  </div>

                  <Button size="lg" className="w-full bg-accent hover:bg-coral-600 text-accent-foreground" onClick={handleDonate} disabled={!form.name || !form.email || amount < 10}>
                    <Heart className="w-5 h-5 mr-2" />
                    Donate {formatCurrency(amount)}
                  </Button>
                </motion.div>
              </div>

              {/* Sidebar */}
              <div className="lg:col-span-2 space-y-6">
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="bg-card rounded-2xl p-6 shadow-soft border border-border">
                  <h3 className="font-serif text-lg mb-4">Your Impact</h3>
                  <div className="space-y-3 text-sm">
                    {[
                      { amount: '₹500', desc: 'Provides dental hygiene kits for 10 children' },
                      { amount: '₹1,000', desc: 'Funds a dental check-up for 5 patients' },
                      { amount: '₹5,000', desc: 'Supports a mobile dental camp for a day' },
                      { amount: '₹25,000', desc: 'Equips a community health worker for 6 months' },
                    ].map(i => (
                      <div key={i.amount} className="flex gap-3">
                        <span className="font-semibold text-primary whitespace-nowrap">{i.amount}</span>
                        <span className="text-muted-foreground">{i.desc}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>

                <div className="bg-card rounded-2xl p-6 shadow-soft border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-5 h-5 text-primary" />
                    <h3 className="font-serif text-lg">Secure & Transparent</h3>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li>• 100% of donations go to programs</li>
                    <li>• Tax deductible under Section 80G</li>
                    <li>• Instant receipt via email</li>
                    <li>• Audited financial reports published annually</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
