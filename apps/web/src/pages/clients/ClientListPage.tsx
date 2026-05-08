import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, Phone, Mail, MapPin, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardHeader, CardContent, CardTitle } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';
import { DonutChart } from '../../components/charts/DonutChart.tsx';

interface Client {
  id: string;
  clientCode: string;
  name: string;
  email: string | null;
  phone: string;
  gstin: string | null;
  contactPersonName: string | null;
  isActive: boolean;
  billingAddress: { line1?: string; city?: string; state?: string } | null;
  createdAt: string;
}

const defaultForm = {
  name: '',
  email: '',
  phone: '',
  gstin: '',
  contactPersonName: '',
  billingAddressLine1: '',
  billingCity: '',
  billingState: '',
  billingPincode: '',
};

function ClientFormModal({ client, onClose }: { client?: Client; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: client?.name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    gstin: client?.gstin ?? '',
    contactPersonName: client?.contactPersonName ?? '',
    billingAddressLine1: (client?.billingAddress as { line1?: string })?.line1 ?? '',
    billingCity: (client?.billingAddress as { city?: string })?.city ?? '',
    billingState: (client?.billingAddress as { state?: string })?.state ?? '',
    billingPincode: (client?.billingAddress as { pincode?: string })?.pincode ?? '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone,
        gstin: form.gstin || undefined,
        contactPersonName: form.contactPersonName || undefined,
        billingAddress: {
          line1: form.billingAddressLine1,
          city: form.billingCity,
          state: form.billingState,
          pincode: form.billingPincode,
        },
        shippingAddress: {
          line1: form.billingAddressLine1,
          city: form.billingCity,
          state: form.billingState,
          pincode: form.billingPincode,
        },
      };
      if (client) {
        await api.patch(`/clients/${client.id}`, payload);
      } else {
        await api.post('/clients', payload);
      }
    },
    onSuccess: () => {
      toast.success(client ? 'Client updated' : 'Client created');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      onClose();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Failed to save client');
    },
  });

  const f = (key: keyof typeof defaultForm) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
    className: 'w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent/30',
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-border">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-text-primary">{client ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface transition-colors">
            <X className="h-5 w-5 text-text-secondary opacity-60" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase tracking-widest mb-1.5 opacity-60">Company Name *</label>
            <input {...f('name')} placeholder="e.g. ABC Traders" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase tracking-widest mb-1.5 opacity-60">Phone *</label>
              <input {...f('phone')} placeholder="+919876543210" />
            </div>
            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase tracking-widest mb-1.5 opacity-60">Email</label>
              <input {...f('email')} type="email" placeholder="purchase@company.in" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase tracking-widest mb-1.5 opacity-60">GSTIN</label>
              <input {...f('gstin')} placeholder="29AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="block text-xs font-bold text-text-secondary uppercase tracking-widest mb-1.5 opacity-60">Contact Person</label>
              <input {...f('contactPersonName')} placeholder="Mr. Ramesh Kumar" />
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <h3 className="text-xs font-black text-text-primary uppercase tracking-widest mb-4">Billing Address</h3>
            <div className="space-y-3">
              <input {...f('billingAddressLine1')} placeholder="Street / Area" />
              <div className="grid grid-cols-3 gap-3">
                <input {...f('billingCity')} placeholder="City" />
                <input {...f('billingState')} placeholder="State" />
                <input {...f('billingPincode')} placeholder="Pincode" />
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-surface border-t border-border px-6 py-4 flex gap-3 justify-end z-10">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} disabled={!form.name || !form.phone} onClick={() => mutation.mutate()}>
            {client ? 'Save Changes' : 'Create Client'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ClientListPage() {
  const canManage = usePermission('clients:manage');
  const [search, setSearch] = useState('');
  const [editClient, setEditClient] = useState<Client | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ items: Client[]; meta: { total: number; totalPages: number } }>({
    queryKey: ['clients', search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const r = await api.get(`/clients?${params}`);
      return { items: r.data.data, meta: r.data.meta };
    },
  });

  const clients = data?.items ?? [];
  const meta = data?.meta;

  const activeStatusSlices = useMemo(() => {
    const active = clients.filter((c) => c.isActive).length;
    const inactive = Math.max(0, clients.length - active);
    return [
      { label: 'ACTIVE', value: active, color: '#16A34A' },
      { label: 'INACTIVE', value: inactive, color: '#6B7280' },
    ];
  }, [clients]);

  return (
    <div className="space-y-6">
      {(showCreate || editClient) && (
        <ClientFormModal
          client={editClient}
          onClose={() => { setShowCreate(false); setEditClient(undefined); }}
        />
      )}

      <PageHeader
        title="Clients"
        subtitle="Manage your customer accounts"
        actions={
          canManage && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>
              New Client
            </Button>
          )
        }
      />

      <Card>
        <CardHeader className="bg-surface/30 border-b border-border">
          <CardTitle className="text-text-primary">Client status</CardTitle>
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-60 mt-0.5">Active vs inactive clients on this page</p>
        </CardHeader>
        <CardContent className="py-6">
          <DonutChart data={activeStatusSlices} height={210} showLegend={false} />
        </CardContent>
      </Card>

      <Card>
        <div className="p-4 border-b border-border bg-surface/30">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary opacity-40" />
            <input
              type="text"
              placeholder="Search clients…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-card text-text-primary outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {clients.map((c) => (
                <div key={c.id} className="px-6 py-5 hover:bg-surface transition-colors group">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-5 w-5 text-accent" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-text-primary text-lg tracking-tight">{c.name}</span>
                          <span className="font-mono text-[10px] text-text-secondary font-bold opacity-40">{c.clientCode}</span>
                          <StatusBadge status={c.isActive ? 'ACTIVE' : 'INACTIVE'} />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-text-secondary font-medium">
                          <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 opacity-60" />{c.phone}</span>
                          {c.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 opacity-60" />{c.email}</span>}
                          {(c.billingAddress as { city?: string })?.city && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 opacity-60" />
                              {(c.billingAddress as { city?: string; state?: string })?.city}, {(c.billingAddress as { city?: string; state?: string })?.state}
                            </span>
                          )}
                          {c.gstin && <span className="opacity-70 font-mono text-[10px] uppercase tracking-tighter">GST: {c.gstin}</span>}
                        </div>
                      </div>
                    </div>
                    {canManage && (
                      <Button variant="outline" size="sm" onClick={() => setEditClient(c)}>Edit</Button>
                    )}
                  </div>
                </div>
              ))}
              {clients.length === 0 && (
                <div className="px-6 py-20 text-center">
                  <Building2 className="h-12 w-12 text-border mx-auto mb-4 opacity-20" />
                  <p className="text-text-primary font-bold">No clients found</p>
                  <p className="text-text-secondary text-xs mt-1 italic opacity-60">Add your first customer to start creating orders</p>
                </div>
              )}
            </div>

            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface/30">
                <p className="text-xs font-bold text-text-secondary uppercase tracking-widest opacity-60">{meta.total} clients total</p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <span className="px-3 py-1.5 text-xs font-black text-text-primary">Page {page} / {meta.totalPages}</span>
                  <Button variant="ghost" size="sm" disabled={page === meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
