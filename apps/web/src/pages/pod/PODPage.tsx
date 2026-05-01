import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle, Package, Truck, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import api from '../../lib/axios.ts';

type Step = 'loading' | 'overview' | 'otp' | 'items' | 'signature' | 'done' | 'expired';

export default function PODPage() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('loading');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [podToken, setPodToken] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [podId, setPodId] = useState('');

  const { data: pod, isLoading, isSuccess, isError, error: podError } = useQuery<Record<string, unknown>>({
    queryKey: ['pod', token],
    queryFn: async () => {
      const r = await api.get(`/pod/link/${token}`);
      return r.data.data as Record<string, unknown>;
    },
    enabled: !!token,
  });

  // Handle query side-effects outside useQuery (React Query v5 removed onSuccess/onError)
  if (isSuccess && pod && step === 'loading') {
    setPodId(pod.id as string);
    setStep('overview');
  }
  if (isError && step === 'loading') {
    const status = (podError as { response?: { status?: number } })?.response?.status;
    setStep(status === 410 ? 'expired' : 'overview');
  }

  const requestOtpMutation = useMutation({
    mutationFn: async () => api.post(`/pod/${podId}/request-otp`, { receiverPhone: `+91${phone}` }),
    onSuccess: () => { setStep('otp'); toast.success('OTP sent!'); },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async () => api.post(`/pod/${podId}/verify-otp`, { otp: otp.join('') }),
    onSuccess: (res) => {
      setPodToken(res.data.data.podToken);
      setStep('items');
    },
    onError: () => toast.error('Invalid OTP. Please try again.'),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async () => {
      const lineItems = (pod?.lineItems || []) as Array<{ lineItemId: string; deliveredBoxes: number }>;
      return api.post(`/pod/${podId}/acknowledge`, {
        receiverName,
        acknowledgedItems: lineItems.map((li: { lineItemId: string; deliveredBoxes: number }) => ({
          lineItemId: li.lineItemId,
          acknowledgedBoxes: li.deliveredBoxes,
        })),
      }, { headers: { Authorization: `Bearer ${podToken}` } });
    },
    onSuccess: () => setStep('done'),
  });

  if (isLoading || step === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>;
  }

  if (step === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Link Expired</h2>
          <p className="text-gray-500 mt-2">This delivery acknowledgement link has expired. Please contact your supplier.</p>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 p-6">
        <div className="max-w-sm text-center">
          <CheckCircle className="h-20 w-20 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Delivery Acknowledged ✓</h2>
          <p className="text-gray-500 mt-2">Thank you, {receiverName}! Your acknowledgement has been recorded.</p>
        </div>
      </div>
    );
  }

  const session = (pod as Record<string, unknown>)?.session as Record<string, unknown>;
  const poData = session?.po as Record<string, unknown>;
  const client = poData?.client as Record<string, unknown>;
  const vehicle = session?.vehicle as Record<string, unknown>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="bg-primary px-6 py-6 text-white text-center">
          <h1 className="text-xl font-bold">Delivery Acknowledgement</h1>
          <p className="text-white/70 text-sm mt-1">PO: {poData?.poNumber as string}</p>
        </div>

        <div className="px-6 py-6 space-y-4">
          {/* Delivery summary */}
          {(step === 'overview' || step === 'otp') && (
            <>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <Truck className="h-5 w-5 text-accent" />
                  <span className="font-semibold text-gray-900">Delivery Details</span>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between"><span>Vehicle</span><span className="font-medium">{vehicle?.registrationNumber as string}</span></div>
                  <div className="flex justify-between"><span>Driver</span><span className="font-medium">{vehicle?.driverName as string}</span></div>
                  <div className="flex justify-between"><span>Client</span><span className="font-medium">{client?.name as string}</span></div>
                </div>
              </div>

              {step === 'overview' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Mobile Number</label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-3 border border-gray-300 rounded-l-input bg-gray-50 text-gray-500 text-sm">+91</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10-digit mobile"
                        className="flex-1 px-3 py-2.5 border border-gray-300 rounded-r-input text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => requestOtpMutation.mutate()}
                    loading={requestOtpMutation.isPending}
                    disabled={phone.length !== 10}
                  >
                    Send OTP to Verify
                  </Button>
                </>
              )}

              {step === 'otp' && (
                <>
                  <p className="text-sm text-gray-600 text-center">Enter the 6-digit OTP sent to +91{phone.slice(-4).padStart(phone.length, 'X')}</p>
                  <div className="flex gap-2 justify-center">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => {
                          const newOtp = [...otp];
                          newOtp[i] = e.target.value.replace(/\D/g, '');
                          setOtp(newOtp);
                          if (e.target.value && i < 5) {
                            (e.target.nextSibling as HTMLInputElement)?.focus();
                          }
                        }}
                        className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-300 rounded-lg focus:border-accent focus:outline-none"
                      />
                    ))}
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => verifyOtpMutation.mutate()}
                    loading={verifyOtpMutation.isPending}
                    disabled={otp.join('').length !== 6}
                  >
                    Verify OTP
                  </Button>
                </>
              )}
            </>
          )}

          {step === 'items' && (
            <>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <Package className="h-5 w-5 text-accent" />
                  <span className="font-semibold text-gray-900">Items Delivered</span>
                </div>
                <div className="space-y-2">
                  {(((pod as Record<string, unknown>)?.lineItems || []) as Array<Record<string, unknown>>).map((item: Record<string, unknown>) => {
                    const li = item.lineItem as Record<string, unknown>;
                    const variant = li?.variant as Record<string, unknown>;
                    const product = variant?.product as Record<string, unknown>;
                    return (
                      <div key={item.id as string} className="flex justify-between text-sm py-2 border-b border-gray-50">
                        <span className="text-gray-700">{product?.name as string} — {variant?.colourName as string}</span>
                        <span className="font-medium">{item.deliveredBoxes as number} boxes</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name (Receiver)</label>
                <input
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  placeholder="Full name"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => acknowledgeMutation.mutate()}
                loading={acknowledgeMutation.isPending}
                disabled={!receiverName}
              >
                Confirm All Items Received ✓
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
