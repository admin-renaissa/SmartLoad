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
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/5 rounded-full" />
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-white/5 rounded-full" />
      </div>

      <div className="flex-1 flex items-center justify-center p-6 relative">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-accent rounded-2xl mb-4">
              <Scan className="h-9 w-9 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">SmartLoad</h1>
            <p className="text-white/60 mt-1">Barcode Verification & Dispatch System</p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8">
            {!twoFactorToken ? (
              <>
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
              </>
            ) : (
              <>
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
              </>
            )}

            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">SmartLoad v1.0 · Confidential & Proprietary</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
