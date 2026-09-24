import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, AlertCircle, Heart, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { login, isAuthenticated } from '@/lib/auth';
import { seedUsers } from '@/lib/rbac';
import { logAudit } from '@/lib/audit';
import { useEffect } from 'react';

export default function HMISLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    seedUsers();
    if (isAuthenticated('hmis')) navigate('/hmis');
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) { setError('Please enter email and password'); return; }
    setIsLoading(true);
    await new Promise(r => setTimeout(r, 400));
    const session = login(email, password, 'hmis');
    if (session) {
      logAudit({ action: 'auth.login', domain: 'auth', actor: session.name, actorRole: session.role, entityType: 'session', entityId: session.userId, details: 'HMIS portal login' });
      navigate('/hmis');
    } else {
      setError('Invalid credentials or insufficient access for HMIS portal.');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="bg-card rounded-2xl shadow-soft border border-border p-8">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full gradient-hero flex items-center justify-center"><Heart className="w-6 h-6 text-primary-foreground" /></div>
            <div className="text-center">
              <span className="font-serif font-semibold text-2xl text-foreground">Saathi Cares</span>
              <p className="text-xs text-muted-foreground">HMIS Portal</p>
            </div>
          </div>
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6"><Stethoscope className="w-8 h-8 text-teal-600" /></div>
          <h1 className="text-xl font-semibold text-foreground text-center mb-2">HMIS Login</h1>
          <p className="text-muted-foreground text-center mb-8 text-sm">Healthcare Management Information System</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">Email</label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="hmis@saathicares.org" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">Password</label>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" className="pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
            <Button type="submit" size="lg" disabled={isLoading} className="w-full bg-primary hover:bg-primary/90">{isLoading ? 'Signing in...' : 'Sign In'}</Button>
          </form>
          <div className="text-xs text-muted-foreground text-center mt-6 space-y-1">
            <p>HMIS Staff: hmis@saathicares.org / hmis123</p>
            <p>Supervisor: vishal@saathicares.org / super123</p>
            <p>Doctor: aishwarya@saathicares.org / doctor123</p>
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-6"><Link to="/" className="hover:text-primary transition-colors">← Back to website</Link></p>
      </motion.div>
    </div>
  );
}
