import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CheckCircle, Package, Truck, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '../../components/ui/Button.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { DonutChart, type DonutSlice } from '../../components/charts/DonutChart.tsx';
import api from '../../lib/axios.ts';
import { getUiLang, POD_UIcopy, setUiLang, type UiLang } from '../../i18n/messages.ts';
import i18n from '../../i18n/i18n.ts';

/** FR-07.2 delivery photo: `CameraModal` is a QR/barcode scanner driver — not used here. File input + `capture` + canvas JPEG meets the same UX goal on mobile/desktop. */

type Step = 'loading' | 'overview' | 'otp' | 'items' | 'signature' | 'done' | 'expired' | 'invalid';

type PodLine = {
  id: string;
  lineItemId: string;
  deliveredBoxes: number;
  lineItem?: {
    variant?: { colourName?: string; product?: { name?: string } };
  };
};

export default function PODPage() {
  const { token } = useParams<{ token: string }>();
  const [uiLang, setUiLangLocal] = useState<UiLang>(() => getUiLang());
  const t = uiLang === 'hi' ? POD_UIcopy.hi : POD_UIcopy.en;
  const pickLang = (lang: UiLang) => {
    void i18n.changeLanguage(lang);
    setUiLang(lang);
    setUiLangLocal(lang);
  };
  const [step, setStep] = useState<Step>('loading');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [podToken, setPodToken] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [podId, setPodId] = useState('');
  const [itemAcks, setItemAcks] = useState<Record<string, number>>({});
  const [discReasons, setDiscReasons] = useState<Record<string, string>>({});
  const sigRef = useRef<SignatureCanvas>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [deliveryPhotoDataUrl, setDeliveryPhotoDataUrl] = useState<string | null>(null);

  const { data: pod, isLoading, isSuccess, isError, error: podError } = useQuery<Record<string, unknown>>({
    queryKey: ['pod', token],
    queryFn: async () => {
      const r = await api.get(`/pod/link/${token}`);
      return r.data.data as Record<string, unknown>;
    },
    enabled: !!token,
  });

  useEffect(() => {
    if (!isSuccess || !pod || step !== 'loading') return;
    setPodId(pod.id as string);
    setStep('overview');
  }, [isSuccess, pod, step]);

  useEffect(() => {
    if (!isError || step !== 'loading') return;
    const status = (podError as { response?: { status?: number } })?.response?.status;
    if (status === 410) setStep('expired');
    else if (status === 404) setStep('invalid');
    else setStep('invalid');
  }, [isError, podError, step]);

  useEffect(() => {
    if (step !== 'items' || !pod?.lineItems) return;
    const lines = pod.lineItems as PodLine[];
    const next: Record<string, number> = {};
    for (const li of lines) {
      next[li.lineItemId] = li.deliveredBoxes;
    }
    setItemAcks(next);
  }, [step, pod]);

  useEffect(() => {
    if (step !== 'signature' || typeof navigator === 'undefined') return;
    navigator.geolocation?.getCurrentPosition(
      () => {},
      () => {},
      { timeout: 5000 },
    );
  }, [step]);

  const requestOtpMutation = useMutation({
    mutationFn: async () => api.post(`/pod/${podId}/request-otp`, { receiverPhone: `+91${phone}` }),
    onSuccess: () => {
      setStep('otp');
      toast.success(t.toastOtpSent);
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async () => api.post(`/pod/${podId}/verify-otp`, { otp: otp.join('') }),
    onSuccess: (res) => {
      setPodToken(res.data.data.podToken);
      setStep('items');
    },
    onError: () => toast.error(t.toastOtpInvalid),
  });

  const clearSig = useCallback(() => sigRef.current?.clear(), []);

  const acknowledgeMutation = useMutation({
    mutationFn: async () => {
      const lines = (pod?.lineItems || []) as PodLine[];
      const geoPos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
          timeout: 8000,
          maximumAge: 60_000,
        });
      });
      const signatureDataUrl =
        sigRef.current && !sigRef.current.isEmpty() ? sigRef.current.toDataURL('image/png') : undefined;
      return api.post(
        `/pod/${podId}/acknowledge`,
        {
          receiverName,
          acknowledgedItems: lines.map((li) => ({
            lineItemId: li.lineItemId,
            acknowledgedBoxes: itemAcks[li.lineItemId] ?? 0,
            discrepancyReason: discReasons[li.lineItemId] || undefined,
          })),
          geoLat: geoPos?.coords.latitude,
          geoLng: geoPos?.coords.longitude,
          signatureDataUrl,
          deliveryPhotoDataUrl: deliveryPhotoDataUrl ?? undefined,
        },
        { headers: { Authorization: `Bearer ${podToken}` } },
      );
    },
    onSuccess: () => {
      setStep('done');
      toast.success(t.toastSubmitted);
    },
    onError: () => toast.error(t.toastSubmitErr),
  });

  async function onDeliveryPhotoFile(file: File) {
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      if (dataUrl.length > 6_500_000) {
        toast.error(t.photoTooLarge);
        return;
      }
      setDeliveryPhotoDataUrl(dataUrl);
    } catch {
      toast.error(t.toastSubmitErr);
    }
  }

  if (isLoading || step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (step === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <AlertCircle className="h-16 w-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">{t.invalidTitle}</h2>
          <p className="text-gray-500 mt-2">{t.invalidBody}</p>
          <LangToggle uiLang={uiLang} pickLang={pickLang} className="mt-4 justify-center" />
        </div>
      </div>
    );
  }

  if (step === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">{t.expiredTitle}</h2>
          <p className="text-gray-500 mt-2">{t.expiredBody}</p>
          <LangToggle uiLang={uiLang} pickLang={pickLang} className="mt-4 justify-center" />
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 p-6">
        <div className="max-w-sm text-center">
          <CheckCircle className="h-20 w-20 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">{t.doneTitle}</h2>
          <p className="text-gray-500 mt-2">{t.doneThanks(receiverName)}</p>
          <LangToggle uiLang={uiLang} pickLang={pickLang} className="mt-4 justify-center" />
        </div>
      </div>
    );
  }

  const session = (pod as Record<string, unknown>)?.session as Record<string, unknown>;
  const poData = session?.purchaseOrder as Record<string, unknown>;
  const client = poData?.client as Record<string, unknown>;
  const vehicle = session?.vehicle as Record<string, unknown>;
  const lineRows = ((pod as Record<string, unknown>)?.lineItems || []) as PodLine[];

  const discrepancySlices = useMemo<DonutSlice[]>(() => {
    if (!lineRows.length) return [];

    let withReason = 0;
    for (const row of lineRows) {
      const reason = String(discReasons[row.lineItemId] ?? '').trim();
      if (reason.length > 0) withReason += 1;
    }

    const total = lineRows.length;
    const withoutReason = Math.max(0, total - withReason);

    return [
      { label: 'No discrepancy', value: withoutReason, color: '#059669' },
      { label: 'Has discrepancy', value: withReason, color: '#DC2626' },
    ];
  }, [discReasons, lineRows]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto">
        <div className="bg-[#0F2044] px-6 py-6 text-white text-center">
          <h1 className="text-xl font-bold">{t.title}</h1>
          <p className="text-white/70 text-sm mt-1">
            {t.po}: {poData?.poNumber as string}
          </p>
          <LangToggle uiLang={uiLang} pickLang={pickLang} dark />
        </div>

        <div className="px-6 py-6 space-y-4">
          {(step === 'overview' || step === 'otp') && (
            <>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <Truck className="h-5 w-5 text-[#2563EB]" />
                  <span className="font-semibold text-gray-900">{t.deliveryDetails}</span>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>{t.vehicle}</span>
                    <span className="font-medium">{vehicle?.registrationNumber as string}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.driver}</span>
                    <span className="font-medium">{vehicle?.driverName as string}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.client}</span>
                    <span className="font-medium">{client?.name as string}</span>
                  </div>
                </div>
              </div>

              {step === 'overview' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t.yourMobile}</label>
                    <div className="flex gap-2">
                      <span className="flex items-center px-3 border border-gray-300 rounded-l-lg bg-gray-50 text-gray-500 text-sm">
                        +91
                      </span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder={t.mobilePlaceholder}
                        className="flex-1 px-3 py-2.5 border border-gray-300 rounded-r-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/50"
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => requestOtpMutation.mutate()}
                    loading={requestOtpMutation.isPending}
                    disabled={phone.length !== 10}
                  >
                    {t.sendOtp}
                  </Button>
                </>
              )}

              {step === 'otp' && (
                <>
                  <p className="text-sm text-gray-600 text-center">{t.otpPrompt}</p>
                  <div className="flex gap-2 justify-center">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        type="text"
                        maxLength={1}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={digit}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '');
                          const newOtp = [...otp];
                          newOtp[i] = v;
                          setOtp(newOtp);
                          if (v && i < 5) {
                            const parent = e.target.parentElement;
                            const inputs = parent?.parentElement?.querySelectorAll('input');
                            (inputs?.[i + 1] as HTMLInputElement)?.focus();
                          }
                        }}
                        className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-300 rounded-lg focus:border-[#2563EB] focus:outline-none"
                      />
                    ))}
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => verifyOtpMutation.mutate()}
                    loading={verifyOtpMutation.isPending}
                    disabled={otp.join('').length !== 6}
                  >
                    {t.verifyOtp}
                  </Button>
                </>
              )}
            </>
          )}

          {step === 'items' && (
            <>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <Package className="h-5 w-5 text-[#2563EB]" />
                  <span className="font-semibold text-gray-900">{t.confirmQty}</span>
                </div>
                <div className="space-y-3">
                  {lineRows.map((item) => {
                    const variant = item.lineItem?.variant;
                    const product = variant?.product;
                    const ack = itemAcks[item.lineItemId] ?? 0;
                    const short = ack < item.deliveredBoxes;
                    return (
                      <div key={item.id} className="text-sm py-2 border-b border-gray-50 space-y-2">
                        <div className="flex justify-between gap-2">
                          <span className="text-gray-700">
                            {product?.name} — {variant?.colourName}
                          </span>
                          <span className="text-gray-500 shrink-0">
                            {t.dispatched} {item.deliveredBoxes}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500">{t.receivedBoxes}</label>
                          <input
                            type="number"
                            min={0}
                            className="w-20 px-2 py-1 border rounded-md text-right"
                            value={ack}
                            onChange={(e) =>
                              setItemAcks((s) => ({
                                ...s,
                                [item.lineItemId]: Math.max(0, parseInt(e.target.value, 10) || 0),
                              }))
                            }
                          />
                        </div>
                        {short && (
                          <input
                            type="text"
                            placeholder={t.shortageReason}
                            className="w-full text-xs px-2 py-1 border rounded"
                            value={discReasons[item.lineItemId] || ''}
                            onChange={(e) =>
                              setDiscReasons((s) => ({ ...s, [item.lineItemId]: e.target.value }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <p className="text-xs text-gray-500 uppercase font-medium tracking-wide">Discrepancies</p>
                  <span className="text-xs text-gray-400">{lineRows.length} lines</span>
                </div>
                <DonutChart data={discrepancySlices} height={170} showLegend={false} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.receiverName}</label>
                <input
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/50"
                  placeholder={t.fullNamePh}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => setStep('signature')}
                disabled={!receiverName.trim()}
              >
                {t.continueSignature}
              </Button>
            </>
          )}

          {step === 'signature' && (
            <>
              <p className="text-sm text-gray-600">{t.signHint}</p>
              <div className="bg-white border rounded-lg overflow-hidden touch-none">
                <SignatureCanvas
                  ref={sigRef}
                  penColor="#0F2044"
                  canvasProps={{ className: 'w-full h-40' }}
                />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={clearSig}>
                {t.clearSig}
              </Button>
              <p className="text-sm text-gray-600 pt-2">{t.deliveryPhotoHint}</p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onDeliveryPhotoFile(f);
                  e.target.value = '';
                }}
              />
              {deliveryPhotoDataUrl ? (
                <img src={deliveryPhotoDataUrl} alt="" className="w-full max-h-40 object-contain rounded-lg border border-gray-200" />
              ) : null}
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => photoInputRef.current?.click()}>
                  {t.addDeliveryPhoto}
                </Button>
                {deliveryPhotoDataUrl ? (
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setDeliveryPhotoDataUrl(null)}>
                    {t.clearDeliveryPhoto}
                  </Button>
                ) : null}
              </div>
              <Button
                className="w-full"
                onClick={() => acknowledgeMutation.mutate()}
                loading={acknowledgeMutation.isPending}
                disabled={!receiverName.trim()}
              >
                {t.submit}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function fileToCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxW = 1280;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('no canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

function LangToggle({
  uiLang,
  pickLang,
  className = '',
  dark = false,
}: {
  uiLang: UiLang;
  pickLang: (lang: UiLang) => void;
  className?: string;
  dark?: boolean;
}) {
  const btn = (lang: UiLang, label: string) => (
    <button
      type="button"
      key={lang}
      onClick={() => pickLang(lang)}
      className={`text-xs px-3 py-1 rounded-md border transition-colors ${
        dark
          ? uiLang === lang
            ? 'border-white bg-white/20 text-white font-semibold'
            : 'border-white/35 text-white/80 hover:bg-white/10'
          : uiLang === lang
            ? 'border-gray-800 bg-gray-900 text-white font-semibold'
            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {btn('en', POD_UIcopy.en.langEn)}
      {btn('hi', POD_UIcopy.hi.langHi)}
    </div>
  );
}
