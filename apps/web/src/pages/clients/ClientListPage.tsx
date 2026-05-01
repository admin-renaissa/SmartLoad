import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, Phone, Mail, MapPin, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { StatusBadge } from '../../components/ui/StatusBadge.tsx';
import api from '../../lib/axios.ts';
import { usePermission } from '../../hooks/usePermission.ts';

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
    className: 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30',
  });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{client ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
            <input {...f('name')} placeholder="e.g. ABC Traders" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input {...f('phone')} placeholder="+919876543210" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input {...f('email')} type="email" placeholder="purchase@company.in" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
              <input {...f('gstin')} placeholder="29AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
              <input {...f('contactPersonName')} placeholder="Mr. Ramesh Kumar" />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Billing Address</h3>
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
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
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
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search clients…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
        ) : (
          <>
            <div className="divide-y divide-gray-50">
              {clients.map((c) => (
                <div key={c.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-5 w-5 text-accent" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-gray-900">{c.name}</span>
                          <span className="font-mono text-xs text-gray-400">{c.clientCode}</span>
                          <StatusBadge status={c.isActive ? 'ACTIVE' : 'INACTIVE'} />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>
                          {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                          {(c.billingAddress as { city?: string })?.city && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {(c.billingAddress as { city?: string; state?: string })?.city}, {(c.billingAddress as { city?: string; state?: string })?.state}
                            </span>
                          )}
                          {c.gstin && <span>GSTIN: {c.gstin}</span>}
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
                <div className="px-6 py-16 text-center">
                  <Building2 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No clients yet</p>
                  <p className="text-gray-400 text-xs mt-1">Add your first customer to start creating orders</p>
                </div>
              )}
            </div>

            {meta && meta.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">{meta.total} clients</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <span className="px-3 py-1.5 text-sm text-gray-600">Page {page} of {meta.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page === meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
