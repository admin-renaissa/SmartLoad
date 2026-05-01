import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Scan, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/axios.ts';
import { useAuthStore } from '../../store/authStore.ts';
import { Button } from '../../components/ui/Button.tsx';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const loginMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await api.post('/auth/login', data);
      return res.data.data as
        | { needsTwoFactor: true; twoFactorToken: string }
        | {
            needsTwoFactor: false;
            accessToken: string;
            refreshToken: string;
            user: { id: string; email: string; name: string; role: string; phone?: string | null };
          };
    },
    onSuccess: (data) => {
      if ('needsTwoFactor' in data && data.needsTwoFactor) {
        setTwoFactorToken(data.twoFactorToken);
        toast.success('Enter the code from your authenticator app');
        return;
      }
      if (!('accessToken' in data)) return;
      login(
        {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role as Parameters<typeof login>[0]['role'],
          phone: data.user.phone,
        },
        data.accessToken,
        data.refreshToken,
      );
      toast.success(`Welcome back, ${data.user.name}!`);
      navigate('/app/dashboard');
    },
    onError: (error) => {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Login failed';
      toast.error(message);
    },
  });

  const twoFaMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/login/2fa', { twoFactorToken, code: otp.replace(/\s/g, '') });
      return res.data.data as {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; name: string; role: string; phone?: string | null };
      };
    },
    onSuccess: (data) => {
      login(
        {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role as Parameters<typeof login>[0]['role'],
          phone: data.user.phone,
        },
        data.accessToken,
        data.refreshToken,
      );
      toast.success(`Welcome back, ${data.user.name}!`);
      navigate('/app/dashboard');
    },
    onError: (error) => {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Invalid code';
      toast.error(message);
    },
  });

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-80 h-80 bg-white/5 rounded-full"
          animate={reduceMotion ? undefined : { y: [0, 22, 0], opacity: [0.65, 0.85, 0.65] }}
          transition={reduceMotion ? undefined : { duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-60 h-60 bg-white/5 rounded-full"
          animate={reduceMotion ? undefined : { y: [0, -18, 0], opacity: [0.55, 0.85, 0.55] }}
          transition={reduceMotion ? undefined : { duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
              className="inline-flex items-center justify-center w-16 h-16 bg-accent rounded-2xl mb-4"
            >
              <Scan className="h-9 w-9 text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold text-white">SmartLoad</h1>
            <p className="text-white/60 mt-1">Barcode Verification & Dispatch System</p>

            {/* Scanner motif: animated scan line */}
            <div className="mt-5 mx-auto w-56 max-w-[90%]">
              <div className="relative overflow-hidden rounded-xl border border-white/15 bg-white/5 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wider text-white/60">Live scan</p>
                    <p className="text-sm font-semibold text-white">Ready to verify</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.6)]" />
                    <span className="text-xs text-white/60 font-mono">OK</span>
                  </div>
                </div>

                <div className="relative mt-3 h-10 rounded-lg bg-black/10 border border-white/10 overflow-hidden">
                  {/* barcode stripes */}
                  <div className="absolute inset-0 opacity-60">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={i}
                        className="absolute top-1 bottom-1 bg-white/60"
                        style={{
                          left: `${i * (100 / 24)}%`,
                          width: `${(i % 3 === 0 ? 2.2 : i % 3 === 1 ? 1.3 : 0.8) * 0.9}px`,
                          opacity: i % 3 === 0 ? 0.85 : i % 3 === 1 ? 0.55 : 0.35,
                        }}
                      />
                    ))}
                  </div>

                  <motion.div
                    className="absolute left-0 right-0 h-px bg-accent shadow-[0_0_18px_rgba(37,99,235,0.7)]"
                    style={{ top: '16px' }}
                    animate={reduceMotion ? undefined : { y: ['0px', '22px', '0px'] }}
                    transition={reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/20 to-accent/0"
                    animate={reduceMotion ? undefined : { x: ['-40%', '40%'] }}
                    transition={reduceMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <AnimatePresence mode="wait" initial={false}>
              {!twoFactorToken ? (
                <motion.div
                  key="signin"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
                >
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Sign in to your account</h2>
                  <form onSubmit={handleSubmit((d) => loginMutation.mutate(d))} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                      <input
                        {...register('email')}
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.in"
                        className="w-full px-3 py-2.5 rounded-input border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
                      />
                      {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <div className="relative">
                        <input
                          {...register('password')}
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          className="w-full px-3 py-2.5 pr-10 rounded-input border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
                    </div>

                    <Button type="submit" loading={loginMutation.isPending} className="w-full mt-2" size="lg">
                      Sign In
                    </Button>
                  </form>
                </motion.div>
              ) : (
                <motion.div
                  key="twofa"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
                >
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Two-factor authentication</h2>
                  <p className="text-sm text-gray-500 mb-4">Open your authenticator app and enter the 6-digit code.</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="123456"
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-center text-lg tracking-widest font-mono mb-4 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                  <Button
                    type="button"
                    className="w-full"
                    loading={twoFaMutation.isPending}
                    disabled={otp.length < 6}
                    onClick={() => twoFaMutation.mutate()}
                  >
                    Verify & continue
                  </Button>
                  <button
                    type="button"
                    className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
                    onClick={() => {
                      setTwoFactorToken(null);
                      setOtp('');
                    }}
                  >
                    ← Back to sign in
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">SmartLoad v1.0 · Confidential & Proprietary</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
