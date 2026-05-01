import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { UserRole } from '@smartload/shared';
import { Button } from '../../components/ui/Button.tsx';
import api from '../../lib/axios.ts';

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  role: z.nativeEnum(UserRole),
  phone: z.string().optional(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Need an uppercase letter')
    .regex(/[0-9]/, 'Need a number'),
});

type CreateForm = z.infer<typeof createSchema>;

export function CreateUserModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateForm>({
    email: '',
    name: '',
    role: UserRole.OPERATOR,
    phone: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = createSchema.safeParse(form);
      if (!parsed.success) {
        const msg = parsed.error.errors[0]?.message ?? 'Invalid form';
        throw new Error(msg);
      }
      await api.post('/users', {
        email: parsed.data.email,
        name: parsed.data.name,
        role: parsed.data.role,
        phone: parsed.data.phone || undefined,
        password: parsed.data.password,
      });
    },
    onSuccess: () => {
      toast.success('User created. A welcome email has been queued if mail is configured.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof Error
          ? e.message
          : (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to create user');
      toast.error(msg || 'Failed to create user');
    },
  });

  const f = (key: keyof CreateForm) => ({
    value: form[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
    className:
      'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30',
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New user</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input {...f('email')} type="email" autoComplete="off" placeholder="name@company.in" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
            <input {...f('name')} placeholder="First Last" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
            <select {...f('role')}>
              {Object.values(UserRole).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input {...f('phone')} placeholder="+919876543210" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Initial password *</label>
            <input {...f('password')} type="password" autoComplete="new-password" placeholder="8+ chars, 1 uppercase, 1 number" />
            <p className="text-xs text-gray-400 mt-1">Share this with the user or have them change it after first login.</p>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={mutation.isPending}
            onClick={() => { setError(null); mutation.mutate(); }}
            disabled={!form.email || !form.name || !form.password}
          >
            Create user
          </Button>
        </div>
      </div>
    </div>
  );
}
