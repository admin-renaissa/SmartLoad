import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, MonitorSmartphone, Wifi, Usb, Camera, Terminal, ChevronDown, ChevronUp, AlertTriangle, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card, CardContent } from '../../components/ui/Card.tsx';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner.tsx';
import { usePermission } from '../../hooks/usePermission.ts';
import api from '../../lib/axios.ts';
import { DonutChart } from '../../components/charts/DonutChart.tsx';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Driver {
  name: string;
  description: string;
  isActive: boolean;
}

interface ScannerDevice {
  id: string;
  name: string;
  serialNumber: string;
  driverName: string;
  deviceType: string;
  ipAddress: string | null;
  location: string | null;
  notes: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  registeredBy: { id: string; name: string; email: string };
}

const DEVICE_TYPE_BY_DRIVER: Record<string, string> = {
  'hid-keyboard':    'BARCODE_SCANNER',
  'serial':          'SERIAL_SCANNER',
  'zebra-datawedge': 'ZEBRA_HANDHELD',
  'camera':          'MOBILE_CAMERA',
};

const DEVICE_TYPE_LABELS: Record<string, string> = {
  'BARCODE_SCANNER':   'Barcode Scanner (USB / Keyboard Wedge)',
  'BLUETOOTH_SCANNER': 'Bluetooth Scanner',
  'ZEBRA_HANDHELD':    'Zebra Handheld (TC/MC series)',
  'ZEBRA_FIXED':       'Zebra Fixed / Presentation Scanner',
  'ANDROID_DEVICE':    'Android Device with DataWedge',
  'MOBILE_CAMERA':     'Mobile Camera',
  'DESKTOP_CAMERA':    'Desktop / Webcam',
  'SERIAL_SCANNER':    'RS-232 Serial Scanner',
};

function deviceTypeLabel(t: string) {
  return DEVICE_TYPE_LABELS[t] ?? t;
}

// ── Driver helpers ─────────────────────────────────────────────────────────────

function driverIcon(driver: string) {
  switch (driver) {
    case 'zebra-datawedge': return <Wifi className="h-4 w-4" />;
    case 'serial':          return <Terminal className="h-4 w-4" />;
    case 'camera':          return <Camera className="h-4 w-4" />;
    default:                return <Usb className="h-4 w-4" />;
  }
}

function driverLabel(driver: string) {
  const map: Record<string, string> = {
    'hid-keyboard':      'USB / Keyboard Wedge',
    'serial':            'RS-232 Serial',
    'zebra-datawedge':   'Zebra DataWedge',
    'camera':            'Camera',
  };
  return map[driver] ?? driver;
}

function driverBadgeColor(driver: string) {
  switch (driver) {
    case 'zebra-datawedge': return 'bg-blue-100 text-blue-800';
    case 'serial':          return 'bg-orange-100 text-orange-800';
    case 'camera':          return 'bg-purple-100 text-purple-800';
    default:                return 'bg-gray-100 text-gray-700';
  }
}

function formatLastSeen(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Setup instructions ────────────────────────────────────────────────────────

function SetupInstructions({ device }: { device: ScannerDevice }) {
  const [open, setOpen] = useState(false);
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim()?.replace(/\/$/, '') ?? '';

  const content = () => {
    switch (device.driverName) {
      case 'hid-keyboard':
        return (
          <div className="space-y-2 text-sm text-gray-700">
            <p>Plug the USB cable or pair via Bluetooth. The OS registers it as a keyboard — no drivers or additional configuration needed.</p>
            <p>The scan app captures keystrokes automatically when the scan screen is in focus. Serial number <span className="font-mono bg-gray-100 px-1 rounded">{device.serialNumber}</span> will appear on scan events once scanning begins.</p>
          </div>
        );
      case 'serial':
        return (
          <div className="space-y-2 text-sm text-gray-700">
            <p>Connect the scanner via RS-232 COM port. Configure the port with these settings:</p>
            <ul className="list-disc list-inside space-y-1 text-xs font-mono bg-gray-50 p-3 rounded border">
              <li>Baud rate: 9600</li>
              <li>Data bits: 8</li>
              <li>Parity: None</li>
              <li>Stop bits: 1</li>
              <li>Flow control: None</li>
            </ul>
            <p>Map the COM port in the server environment. The API&apos;s <span className="font-mono">serial</span> driver will strip STX/ETX control characters automatically.</p>
          </div>
        );
      case 'zebra-datawedge':
        return (
          <div className="space-y-3 text-sm text-gray-700">
            <p>On the Zebra device, open <strong>DataWedge</strong> and create or edit a profile. Set the output plugin to <strong>HTTP</strong> with these settings:</p>
            <div className="bg-gray-50 border rounded p-3 space-y-2 text-xs font-mono">
              <p><span className="text-gray-500">Method:</span> POST</p>
              <p className="break-all">
                <span className="text-gray-500">URL:</span>{' '}
                {apiUrl}/api/v1/scan/datawedge?sessionId=<span className="text-amber-700">{'<session-id>'}</span>
              </p>
              <p><span className="text-gray-500">Content-Type:</span> application/json</p>
            </div>
            <p>Set the JSON payload format in DataWedge to:</p>
            <pre className="bg-gray-50 border rounded p-3 text-xs overflow-x-auto">{`{
  "data": "%BARCODE%",
  "labelType": "%LABEL_TYPE%",
  "deviceId": "${device.serialNumber}"
}`}</pre>
            <p className="text-xs text-amber-700 flex items-start gap-1">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Replace <span className="font-mono mx-1">{'<session-id>'}</span> in the URL with the active dispatch session ID before scanning.
            </p>
          </div>
        );
      case 'camera':
        return (
          <div className="space-y-2 text-sm text-gray-700">
            <p>No hardware configuration needed. On the scan screen, tap the <strong>Camera</strong> button to open the in-app QR/barcode reader.</p>
            <p>The device ID <span className="font-mono bg-gray-100 px-1 rounded">{device.serialNumber}</span> should match the <span className="font-mono">deviceId</span> sent in the camera payload.</p>
          </div>
        );
      default:
        return <p className="text-sm text-gray-500">No setup instructions available for this driver.</p>;
    }
  };

  return (
    <div className="border-t pt-3 mt-3">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        onClick={() => setOpen((s) => !s)}
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Setup instructions
      </button>
      {open && <div className="mt-3">{content()}</div>}
    </div>
  );
}

// ── Register / Edit modal ─────────────────────────────────────────────────────

interface DeviceModalProps {
  device?: ScannerDevice;
  onClose: () => void;
}

function DeviceModal({ device, onClose }: DeviceModalProps) {
  const qc = useQueryClient();
  const isEdit = Boolean(device);

  const [form, setForm] = useState({
    name: device?.name ?? '',
    serialNumber: device?.serialNumber ?? '',
    driverName: device?.driverName ?? 'hid-keyboard',
    ipAddress: device?.ipAddress ?? '',
    location: device?.location ?? '',
    notes: device?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: driversData } = useQuery({
    queryKey: ['devices', 'drivers'],
    queryFn: async () => {
      const r = await api.get('/devices/drivers');
      return r.data.data as Driver[];
    },
  });
  const drivers = driversData ?? [
    { name: 'hid-keyboard', description: 'USB/Bluetooth keyboard-wedge scanner', isActive: false },
    { name: 'serial', description: 'RS-232 serial port scanner', isActive: false },
    { name: 'zebra-datawedge', description: 'Zebra DataWedge HTTP output', isActive: false },
    { name: 'camera', description: 'Browser camera scanner', isActive: false },
  ];

  function validate() {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = 'Name must be at least 2 characters';
    if (!isEdit && form.serialNumber.trim().length < 1) e.serialNumber = 'Serial number is required';
    if (form.driverName === 'zebra-datawedge' && !form.ipAddress.trim()) {
      e.ipAddress = 'IP address is recommended for DataWedge devices';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        driverName: form.driverName,
        deviceType: DEVICE_TYPE_BY_DRIVER[form.driverName] ?? 'BARCODE_SCANNER',
        ipAddress: form.ipAddress.trim() || undefined,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (!isEdit) {
        payload.serialNumber = form.serialNumber.trim();
        return api.post('/devices', payload);
      }
      return api.patch(`/devices/${device!.id}`, payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Device updated' : 'Device registered');
      void qc.invalidateQueries({ queryKey: ['devices'] });
      onClose();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Could not save device');
    },
  });

  function f(key: string) {
    return {
      value: form[key as keyof typeof form],
      onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setForm((s) => ({ ...s, [key]: ev.target.value })),
    };
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="font-semibold text-lg text-gray-900">
            {isEdit ? 'Edit device' : 'Register scanner device'}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Device name <span className="text-red-500">*</span></label>
            <input {...f('name')} placeholder="e.g. Loading Bay 1 Scanner" className={inputCls} />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial number / Device ID <span className="text-red-500">*</span></label>
              <input {...f('serialNumber')} placeholder="e.g. SN12345 or MAC address" className={inputCls} />
              <p className="mt-1 text-xs text-gray-500">Must be unique. Used to match scans from this device.</p>
              {errors.serialNumber && <p className="mt-1 text-xs text-red-600">{errors.serialNumber}</p>}
            </div>
          )}

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver type <span className="text-red-500">*</span></label>
              <select {...f('driverName')} className={inputCls}>
                {drivers.map((d) => (
                  <option key={d.name} value={d.name}>
                    {driverLabel(d.name)} — {d.description}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(isEdit ? device?.driverName : form.driverName) === 'zebra-datawedge' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Device IP address</label>
              <input {...f('ipAddress')} placeholder="e.g. 192.168.1.55" className={inputCls} />
              <p className="mt-1 text-xs text-gray-500">Used for documentation; DataWedge pushes to the API, not the other way.</p>
              {errors.ipAddress && <p className="mt-1 text-xs text-amber-600">{errors.ipAddress}</p>}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input {...f('location')} placeholder="e.g. Loading Bay 2" className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              {...f('notes')}
              rows={2}
              placeholder="Any notes about this device"
              className={inputCls}
            />
          </div>
        </div>
        <div className="p-6 border-t flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={saveMut.isPending}
            onClick={() => {
              if (validate()) saveMut.mutate();
            }}
          >
            {isEdit ? 'Save changes' : 'Register device'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Device card ───────────────────────────────────────────────────────────────

interface DeviceCardProps {
  device: ScannerDevice;
  canManage: boolean;
  onEdit: (d: ScannerDevice) => void;
  onDeactivate: (id: string) => void;
  deactivating: boolean;
  onViewDetail: (id: string) => void;
}

function DeviceCard({ device, canManage, onEdit, onDeactivate, deactivating, onViewDetail }: DeviceCardProps) {
  const lastSeen = formatLastSeen(device.lastSeenAt);
  const seenRecently = device.lastSeenAt && Date.now() - new Date(device.lastSeenAt).getTime() < 5 * 60_000;

  return (
    <Card className={!device.isActive ? 'opacity-60' : ''}>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-2 rounded-lg ${driverBadgeColor(device.driverName)}`}>
              {driverIcon(device.driverName)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">{device.name}</p>
              <p className="text-xs font-mono text-gray-500 truncate">{device.serialNumber}</p>
            </div>
          </div>
          <span
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold ${
              !device.isActive
                ? 'bg-gray-200 text-gray-600'
                : seenRecently
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {!device.isActive ? 'INACTIVE' : seenRecently ? 'ACTIVE' : 'REGISTERED'}
          </span>
        </div>

        <div className="space-y-1.5 text-xs text-gray-600">
          <div className="flex items-center gap-1.5">
            {driverIcon(device.driverName)}
            <span>{driverLabel(device.driverName)}</span>
          </div>
          <p className="text-gray-500">
            <span className="font-medium text-gray-700">Type:</span> {deviceTypeLabel(device.deviceType)}
          </p>
          {device.location && (
            <p className="text-gray-500">
              <span className="font-medium text-gray-700">Location:</span> {device.location}
            </p>
          )}
          {device.ipAddress && (
            <p className="font-mono text-gray-500">
              <span className="font-medium text-gray-700 font-sans">IP:</span> {device.ipAddress}
            </p>
          )}
          <p className="text-gray-500">
            <span className="font-medium text-gray-700">Last seen:</span>{' '}
            <span className={seenRecently ? 'text-emerald-600 font-medium' : ''}>{lastSeen}</span>
          </p>
          <p className="text-gray-400">Registered by {device.registeredBy.name}</p>
        </div>

        {device.notes && (
          <p className="text-xs text-gray-500 italic border-t pt-2">{device.notes}</p>
        )}

        <div className={`flex gap-2 pt-2 border-t ${canManage ? 'justify-between' : 'justify-end'}`}>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-accent"
            onClick={() => onViewDetail(device.id)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            History
          </Button>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onEdit(device)}>
                Edit
              </Button>
              {device.isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-700"
                  loading={deactivating}
                  onClick={() => {
                    const ok = window.confirm(`Deactivate "${device.name}"?`);
                    if (ok) onDeactivate(device.id);
                  }}
                >
                  Deactivate
                </Button>
              )}
            </div>
          )}
        </div>

        <SetupInstructions device={device} />
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ScannerDevicesPage() {
  const canManage = usePermission('devices:manage');
  const navigate = useNavigate();
  const [modal, setModal] = useState<ScannerDevice | 'new' | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const r = await api.get('/devices?limit=100');
      return r.data.data as ScannerDevice[];
    },
  });

  const devices = data ?? [];

  const stats = useMemo(() => {
    const active = devices.filter((d) => d.isActive).length;
    const inactive = devices.length - active;
    const byDriver: Record<string, number> = {};
    for (const d of devices) {
      byDriver[d.driverName] = (byDriver[d.driverName] ?? 0) + 1;
    }
    return { total: devices.length, active, inactive, byDriver };
  }, [devices]);

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => {
      setDeactivatingId(id);
      await api.delete(`/devices/${id}`);
    },
    onSuccess: () => {
      toast.success('Device deactivated');
      void qc.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Could not deactivate device');
    },
    onSettled: () => setDeactivatingId(null),
  });

  return (
    <div className="space-y-6">
      {modal === 'new' && <DeviceModal onClose={() => setModal(null)} />}
      {modal && modal !== 'new' && (
        <DeviceModal device={modal} onClose={() => setModal(null)} />
      )}

      <PageHeader
        title="Scanner Devices"
        subtitle="Registered barcode scanning hardware"
        actions={
          canManage ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setModal('new')}>
              Register Device
            </Button>
          ) : null
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Total', String(stats.total)],
          ['Active / Registered', String(stats.active)],
          ['Inactive', String(stats.inactive)],
          ['Driver types', String(Object.keys(stats.byDriver).length)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="p-4 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-900">Driver types mix</p>
          <p className="text-xs text-gray-500 mt-0.5">Distribution across registered scanners</p>
        </div>
        <div className="p-4">
          <DonutChart
            data={Object.entries(stats.byDriver)
              .map(([k, v]) => ({ label: deviceTypeLabel(k), value: v }))
              .sort((a, b) => b.value - a.value)}
            height={220}
            showLegend
          />
        </div>
      </Card>

      {/* Device grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-10 flex justify-center">
                <LoadingSpinner />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : devices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices.map((d) => (
            <DeviceCard
              key={d.id}
              device={d}
              canManage={canManage}
              onEdit={(dev) => setModal(dev)}
              onDeactivate={(id) => deactivateMut.mutate(id)}
              deactivating={deactivatingId === d.id && deactivateMut.isPending}
              onViewDetail={(id) => navigate(`/app/devices/${id}`)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center text-gray-500">
            <MonitorSmartphone className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="font-medium mb-1">No scanner devices registered</p>
            <p className="text-sm text-gray-400 mb-5">
              Register your USB, serial, Zebra, or camera-based scanners to track usage and get setup instructions.
            </p>
            {canManage && (
              <Button variant="outline" onClick={() => setModal('new')}>
                Register first device
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
