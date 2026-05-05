import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Scan, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
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

  // Product insight carousel (static data; no API needed for login screen).
  const productSlides = [
    {
      title: 'Stock readiness',
      subtitle: 'Low-stock alerts + reservation visibility',
      pct: 72,
      bars: [3, 2, 4, 6, 5, 7, 6, 8, 6, 9, 7, 10],
      barClass: 'bg-accent',
      sparkClass: 'bg-accent/80',
    },
    {
      title: 'Dispatch validation',
      subtitle: 'Barcode checks that prevent mismatches',
      pct: 88,
      bars: [2, 3, 2, 4, 5, 6, 7, 6, 8, 9, 8, 10],
      barClass: 'bg-emerald-400',
      sparkClass: 'bg-emerald-400/80',
    },
    {
      title: 'Audit confidence',
      subtitle: 'Traceable actions with instant status',
      pct: 79,
      bars: [1, 2, 3, 4, 5, 4, 6, 7, 6, 8, 7, 9],
      barClass: 'bg-sky-400',
      sparkClass: 'bg-sky-400/80',
    },
  ] as const;

  const [slideIndex, setSlideIndex] = useState(0);
  const [scanPulseTick, setScanPulseTick] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const interval = window.setInterval(() => {
      setSlideIndex((i) => (i + 1) % productSlides.length);
    }, 4200);
    return () => window.clearInterval(interval);
  }, [reduceMotion, productSlides.length]);

  useEffect(() => {
    if (reduceMotion) return;
    const interval = window.setInterval(() => setScanPulseTick((t) => t + 1), 1600);
    return () => window.clearInterval(interval);
  }, [reduceMotion]);

  const sparkWaveIndex =
    productSlides[slideIndex]?.bars?.length ? scanPulseTick % productSlides[slideIndex].bars.length : 0;

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
    <div className="min-h-screen relative flex flex-col overflow-hidden bg-primary-900">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b1730] via-primary-900 to-[#070f21] pointer-events-none" aria-hidden />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-accent/[0.12] pointer-events-none"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_15%_-15%,rgba(37,99,235,0.28),transparent_52%)] pointer-events-none"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_105%_110%,rgba(52,211,153,0.09),transparent_48%)] pointer-events-none"
        aria-hidden
      />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-28 -right-32 w-[26rem] h-[26rem] rounded-full bg-gradient-to-br from-accent/25 via-sky-400/10 to-transparent blur-2xl"
          animate={reduceMotion ? undefined : { y: [0, 24, 0], opacity: [0.55, 0.88, 0.55], scale: [1, 1.04, 1] }}
          transition={reduceMotion ? undefined : { duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-24 -left-36 w-[22rem] h-[22rem] rounded-full bg-gradient-to-tr from-primary-500/25 via-accent/15 to-emerald-400/10 blur-2xl"
          animate={reduceMotion ? undefined : { y: [0, -20, 0], opacity: [0.45, 0.78, 0.45] }}
          transition={reduceMotion ? undefined : { duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[min(90vw,42rem)] h-[min(90vw,42rem)] rounded-full bg-primary-700/20 blur-3xl opacity-70"
          animate={reduceMotion ? undefined : { opacity: [0.45, 0.65, 0.45] }}
          transition={reduceMotion ? undefined : { duration: 14, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="flex-1 flex flex-col items-stretch px-5 sm:px-8 lg:px-12 xl:px-14 py-6 sm:py-8 relative min-h-0">
        <div className="w-full flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,520px)] lg:grid-rows-[minmax(0,1fr)] gap-8 lg:gap-10 items-stretch">
          <div className="flex flex-col text-center lg:text-left min-h-0 lg:min-h-0 lg:h-full">
            <div className="shrink-0">
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
            </div>

            {/* Scanner motif: animated scan line — grows to fill vertical space on large screens */}
            <motion.div
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
              className="mt-5 mx-auto lg:mx-0 w-full max-w-[420px] lg:max-w-xl flex-1 min-h-[200px] lg:min-h-0 flex flex-col"
            >
              <div className="relative overflow-hidden rounded-xl border border-white/15 bg-white/5 px-4 py-3 shadow-[0_0_0_1px_rgba(37,99,235,0.18)] flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between gap-3 shrink-0">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-wider text-white/60">Live scan</p>
                    <p className="text-sm font-semibold text-white">Ready to verify</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.span
                      className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.6)]"
                      animate={
                        reduceMotion ? undefined : { scale: [1, 1.6, 1], opacity: [0.9, 1, 0.85] }
                      }
                      transition={
                        reduceMotion ? undefined : { duration: 1.25, repeat: Infinity, ease: 'easeInOut' }
                      }
                    />
                    <span className="text-xs text-white/60 font-mono">OK</span>
                  </div>
                </div>

                <div className="relative mt-3 flex-1 min-h-[100px] lg:min-h-[140px] rounded-lg bg-black/10 border border-white/10 overflow-hidden">
                  {/* rotating tech grid (very subtle) */}
                  <motion.div
                    className="absolute inset-0 opacity-[0.18]"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.35) 1px, transparent 1px)',
                      backgroundSize: '18px 18px',
                      transformOrigin: '50% 50%',
                    }}
                    animate={reduceMotion ? undefined : { rotate: [0, 360] }}
                    transition={reduceMotion ? undefined : { duration: 16, repeat: Infinity, ease: 'linear' }}
                  />

                  {/* moving shimmer */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    animate={reduceMotion ? undefined : { x: ['-60%', '60%'] }}
                    transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'linear' }}
                  />

                  {/* neon border pulse */}
                  <motion.div
                    className="absolute inset-0 rounded-lg border border-accent/35"
                    animate={reduceMotion ? undefined : { opacity: [0.25, 0.75, 0.25] }}
                    transition={reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />

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

                  {/* scan line + glow (top % tracks flexible barcode viewport height) */}
                  <motion.div
                    className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-accent/60 via-accent to-accent/60 shadow-[0_0_18px_rgba(37,99,235,0.75)] blur-[0.2px]"
                    style={{ top: reduceMotion ? '42%' : undefined }}
                    animate={reduceMotion ? undefined : { top: ['12%', '78%', '12%'] }}
                    transition={reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />

                  {/* scan corner sweep */}
                  <motion.div
                    className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-accent/70"
                    animate={reduceMotion ? undefined : { opacity: [0.1, 1, 0.1], y: [0, 10, 0] }}
                    transition={reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-accent/70"
                    animate={reduceMotion ? undefined : { opacity: [0.1, 1, 0.1], y: [0, -10, 0] }}
                    transition={reduceMotion ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  />

                  {/* extra accent wash */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/20 to-accent/0"
                    animate={reduceMotion ? undefined : { x: ['-40%', '40%'] }}
                    transition={reduceMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
              </div>
            </motion.div>

            {/* Product Insights carousel */}
            <motion.div
              className="mt-5 w-full shrink-0 max-w-[420px] lg:max-w-xl mx-auto lg:mx-0"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut', delay: reduceMotion ? 0 : 0.1 }}
            >
              <motion.div
                className="relative overflow-hidden rounded-xl border border-white/15 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        boxShadow:
                          scanPulseTick % 2 === 0
                            ? '0 0 0 1px rgba(255,255,255,0.06), 0 0 28px rgba(37,99,235,0.22)'
                            : '0 0 0 1px rgba(255,255,255,0.06), 0 0 18px rgba(37,99,235,0.10)',
                      }
                }
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                {!reduceMotion && (
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                    animate={{ x: ['-60%', '60%'] }}
                    transition={{ duration: 2.0, repeat: Infinity, ease: 'linear' }}
                    style={{ mixBlendMode: 'screen' as const }}
                  />
                )}

                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-white/60">Product insights</p>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={slideIndex}
                          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                          transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
                        >
                          <h3 className="text-sm font-semibold text-white leading-tight">
                            {productSlides[slideIndex].title}
                          </h3>
                          <p className="text-xs text-white/60 mt-1">{productSlides[slideIndex].subtitle}</p>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-mono text-white">{productSlides[slideIndex].pct}%</div>
                      <div className="text-[10px] text-white/50">coverage</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden relative">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={`bar-${slideIndex}`}
                          className={`h-full rounded-full ${productSlides[slideIndex].barClass}`}
                          initial={{ width: '0%' }}
                          animate={{ width: `${productSlides[slideIndex].pct}%` }}
                          exit={{ width: '0%' }}
                          transition={{ duration: reduceMotion ? 0 : 0.35, ease: 'easeOut' }}
                          style={{ overflow: 'hidden' }}
                        >
                          {!reduceMotion && (
                            <motion.div
                              className="h-full w-full"
                              style={{
                                backgroundImage:
                                  'linear-gradient(90deg, rgba(255,255,255,0.0), rgba(255,255,255,0.35), rgba(255,255,255,0.0))',
                              }}
                              animate={{ x: ['-60%', '60%'] }}
                              transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
                            />
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    <div className="mt-3 flex items-end gap-1 h-8">
                      {productSlides[slideIndex].bars.map((b, i) => {
                        const height = Math.max(12, (b / 10) * 28);
                        return (
                          <motion.div
                            key={`${slideIndex}-${i}`}
                            className={`w-1.5 rounded-full ${i > 7 ? productSlides[slideIndex].sparkClass : 'bg-white/20'}`}
                            style={{ height: `${height}px`, transformOrigin: 'bottom' }}
                            animate={
                              reduceMotion
                                ? undefined
                                : { scaleY: i === sparkWaveIndex ? 1.22 : 0.92 }
                            }
                            transition={{ duration: reduceMotion ? 0 : 0.45, ease: 'easeInOut' }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <div className="flex gap-1">
                      {productSlides.map((s, i) => (
                        <span
                          key={s.title}
                          className={`h-1.5 rounded-full ${i === slideIndex ? 'w-10 bg-white/70' : 'w-6 bg-white/10'}`}
                        />
                      ))}
                    </div>

                    {!reduceMotion && (
                      <motion.span
                        className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.65)]"
                        animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.35, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>

          <div className="flex items-center justify-center self-stretch w-full min-h-0 min-w-0 py-2 lg:py-0">
            <div className="rounded-2xl border border-sky-200/50 bg-gradient-to-b from-white via-primary-50/40 to-slate-100/90 p-8 sm:p-10 w-full max-w-[520px] flex flex-col shadow-[0_24px_50px_-12px_rgba(7,15,33,0.5)] ring-1 ring-white/30 backdrop-blur-sm">
            <AnimatePresence mode="wait" initial>
              {!twoFactorToken ? (
                <motion.div
                  key="signin"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 30, y: 6 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -20, y: -6 }}
                  transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
                >
                  <h2 className="text-xl font-semibold text-primary-900 mb-1">Sign in to your account</h2>
                  <p className="text-sm text-primary-800/65 mb-6">Use your work email and password.</p>
                  <form onSubmit={handleSubmit((d) => loginMutation.mutate(d))} className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-primary-900/85 mb-1">Email address</label>
                      <input
                        {...register('email')}
                        type="email"
                        autoComplete="email"
                        placeholder="you@company.in"
                        className="w-full px-3 py-2.5 rounded-input border border-primary-200/80 bg-white/90 text-primary-900 placeholder:text-primary-400/70 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition shadow-sm"
                      />
                      {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-primary-900/85 mb-1">Password</label>
                      <div className="relative">
                        <input
                          {...register('password')}
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          className="w-full px-3 py-2.5 pr-10 rounded-input border border-primary-200/80 bg-white/90 text-primary-900 placeholder:text-primary-400/70 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-accent"
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
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 30, y: 6 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -20, y: -6 }}
                  transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
                >
                  <h2 className="text-xl font-semibold text-primary-900 mb-2">Two-factor authentication</h2>
                  <p className="text-sm text-primary-800/65 mb-4">Open your authenticator app and enter the 6-digit code.</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="123456"
                    className="w-full px-3 py-2.5 rounded-lg border border-primary-200/80 bg-white/90 text-primary-900 text-center text-lg tracking-widest font-mono mb-4 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent shadow-sm"
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
                    className="mt-4 w-full text-sm text-primary-700/80 hover:text-accent font-medium"
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

            <div className="mt-8 pt-6 border-t border-primary-200/50">
              <p className="text-xs text-primary-700/55 text-center">SmartLoad v1.0 · Confidential & Proprietary</p>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
