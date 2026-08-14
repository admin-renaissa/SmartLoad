import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PageTransition } from '../components/animation/PageTransition.tsx';
import {
  LayoutDashboard, ShoppingCart, Package, Users, UserCog, Warehouse,
  Truck, Activity, BarChart3, Settings, RefreshCw, ClipboardList,
  LogOut, ChevronLeft, ChevronRight, ChevronDown, Menu, X, Scan, MonitorSmartphone,
  Phone,
} from 'lucide-react';
import { useAuthStore, type AuthUser } from '../store/authStore.ts';
import { cn } from '../utils/cn.ts';
import api from '../lib/axios.ts';
import { usePermission } from '../hooks/usePermission.ts';
import { GlobalSearch } from '../components/ui/GlobalSearch.tsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.tsx';

const navPermissionKeys = [
  'dashboard:supervisor',
  'scan:operate',
  'orders:view',
  'products:view',
  'clients:view',
  'inventory:view',
  'vehicles:view',
  'tally:view',
  'reports:view',
  'audit:view',
  'users:manage',
  'devices:view',
] as const;

type NavPermission = (typeof navPermissionKeys)[number];

type NavItemDef = {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
  exact?: boolean;
  permission?: NavPermission;
};

const navItems: NavItemDef[] = [
  { href: '/app/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard', exact: true },
  { href: '/app/dispatch', icon: Activity, labelKey: 'nav.dispatch', permission: 'dashboard:supervisor' },
  { href: '/scan', icon: Scan, labelKey: 'nav.scanApp', permission: 'scan:operate' },
  { href: '/app/orders', icon: ShoppingCart, labelKey: 'nav.orders', permission: 'orders:view' },
  { href: '/app/products', icon: Package, labelKey: 'nav.products', permission: 'products:view' },
  { href: '/app/clients', icon: Users, labelKey: 'nav.clients', permission: 'clients:view' },
  { href: '/app/inventory', icon: Warehouse, labelKey: 'nav.inventory', permission: 'inventory:view' },
  { href: '/app/vehicles', icon: Truck, labelKey: 'nav.vehicles', permission: 'vehicles:view' },
  { href: '/app/tally', icon: RefreshCw, labelKey: 'nav.tallySync', permission: 'tally:view' },
  { href: '/app/reports', icon: BarChart3, labelKey: 'nav.reports', permission: 'reports:view' },
  { href: '/app/audit', icon: ClipboardList, labelKey: 'nav.auditLog', permission: 'audit:view' },
  { href: '/app/devices', icon: MonitorSmartphone, labelKey: 'nav.devices', permission: 'devices:view' },
  { href: '/app/settings', icon: Settings, labelKey: 'nav.account' },
  { href: '/app/users', icon: UserCog, labelKey: 'nav.users', permission: 'users:manage' },
];

// ── User initials helper ───────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// ── UserProfileMenu ────────────────────────────────────────────────────────────

function UserProfileMenu({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function updatePosition() {
      if (open && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const dropdownWidth = 280;
        const spacing = 8;
        
        // Default position: below and right-aligned with trigger
        let top = rect.bottom + spacing;
        let right = window.innerWidth - rect.right;
        
        // Viewport safety checks
        // 1. Right boundary
        if (right < spacing) {
          right = spacing;
        }
        // 2. Left boundary (if dropdown is wider than space from right)
        if (window.innerWidth - right < dropdownWidth) {
          right = window.innerWidth - dropdownWidth - spacing;
        }
        // 3. Bottom boundary (flip if not enough space below)
        const dropdownHeight = panelRef.current?.offsetHeight || 250;
        if (top + dropdownHeight > window.innerHeight && rect.top > dropdownHeight) {
          top = rect.top - dropdownHeight - spacing;
        }

        setPanelStyle({
          position: 'fixed',
          top,
          right,
          zIndex: 9999,
          width: dropdownWidth,
        });
      }
    }

    if (open) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true); // capture phase for all scrollable parents
    }

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  // Close only when clicking outside BOTH the trigger and the panel
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      const outsideTrigger = triggerRef.current && !triggerRef.current.contains(target);
      const outsidePanel = panelRef.current && !panelRef.current.contains(target);
      if (outsideTrigger && outsidePanel) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const initials = getInitials(user.name);

  function goSettings() {
    setOpen(false);
    navigate('/app/settings');
  }

  function handleLogout() {
    setOpen(false);
    onLogout();
  }

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors group"
      >
        {/* Avatar circle */}
        <span className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initials}
        </span>
        {/* Name — hidden on small screens, no artificial max-width */}
        <span className="hidden sm:block text-sm font-medium text-text-primary group-hover:text-text-primary/80">
          {user.name}
        </span>
        <ChevronDown className={cn('hidden sm:block h-3.5 w-3.5 text-text-secondary flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="bg-surface rounded-xl shadow-2xl border border-border overflow-hidden"
        >
          {/* Profile header */}
          <div className="px-4 py-4 flex items-start gap-3 bg-background/50">
            <span className="w-12 h-12 rounded-full bg-accent flex items-center justify-center text-white text-base font-bold flex-shrink-0 shadow-sm">
              {initials}
            </span>
            <div className="flex-1 overflow-hidden">
              <p className="font-semibold text-text-primary break-words line-clamp-1">{user.name}</p>
              <p className="text-xs text-text-secondary break-all mt-0.5">{user.email}</p>
              <span className="inline-block mt-1.5 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium">
                {user.role}
              </span>
              {user.phone && (
                <p className="flex items-center gap-1 mt-1.5 text-xs text-gray-500">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  {user.phone}
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Actions */}
          <div className="py-1.5">
            <button
              type="button"
              onClick={goSettings}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-background transition-colors text-left group"
            >
              <Settings className="h-4 w-4 text-text-secondary flex-shrink-0 group-hover:text-accent transition-colors" />
              Account Settings
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left group"
            >
              <LogOut className="h-4 w-4 flex-shrink-0 group-hover:scale-110 transition-transform" />
              Logout
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function NavItem({ href, icon: Icon, label, exact, collapsed }: {
  href: string; icon: typeof LayoutDashboard; label: string; exact?: boolean; collapsed: boolean;
}) {
  return (
    <NavLink
      to={href}
      end={exact}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
          'hover:bg-white/10',
          isActive
            ? 'bg-white/15 text-white'
            : 'text-white/70 hover:text-white',
          collapsed && 'justify-center px-2',
        )
      }
      title={collapsed ? label : undefined}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const canScan = usePermission('scan:operate');
  const canViewOrders = usePermission('orders:view');
  const canViewProducts = usePermission('products:view');
  const canViewClients = usePermission('clients:view');
  const canViewInventory = usePermission('inventory:view');
  const canViewVehicles = usePermission('vehicles:view');
  const canViewTally = usePermission('tally:view');
  const canViewReports = usePermission('reports:view');
  const canViewAudit = usePermission('audit:view');
  const canManageUsers = usePermission('users:manage');
  const canViewSuperDash = usePermission('dashboard:supervisor');
  const canViewDevices = usePermission('devices:view');

  const permissionMap: Record<string, boolean> = {
    'dashboard:supervisor': canViewSuperDash,
    'scan:operate': canScan,
    'orders:view': canViewOrders,
    'products:view': canViewProducts,
    'clients:view': canViewClients,
    'inventory:view': canViewInventory,
    'vehicles:view': canViewVehicles,
    'tally:view': canViewTally,
    'reports:view': canViewReports,
    'audit:view': canViewAudit,
    'users:manage': canManageUsers,
    'devices:view': canViewDevices,
  };

  const handleLogout = async () => {
    const { refreshToken } = useAuthStore.getState();
    try {
      await api.post('/auth/logout', refreshToken ? { refreshToken } : {});
    } catch {
      // ignore
    }
    logout();
    navigate('/login');
  };

  const filteredNavItems = navItems
    .filter((item) => !item.permission || permissionMap[item.permission])
    .map((item) => ({ ...item, label: t(item.labelKey) }));

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn('flex items-center h-16 px-4 border-b border-white/10', collapsed ? 'justify-center' : 'gap-3')}>
        <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center flex-shrink-0">
          <Scan className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-bold text-white text-lg">SmartLoad</span>
            <p className="text-white/50 text-xs">{t('nav.smartloadSubtitle')}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {filteredNavItems.map(({ labelKey: _lk, permission: _perm, ...item }) => (
          <NavItem key={item.href} {...item} collapsed={collapsed} />
        ))}
      </nav>

      {/* User section */}
      <div className={cn('px-2 py-4 border-t border-white/10', collapsed && 'px-2')}>
        {!collapsed && (
          <div className="px-3 py-2 mb-2">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <p className="text-white/50 text-xs truncate">{user?.email}</p>
            <span className="inline-block mt-1 text-xs bg-white/20 text-white px-2 py-0.5 rounded-full">
              {user?.role}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
            'text-white/70 hover:text-white hover:bg-white/10 transition-all',
            collapsed && 'justify-center',
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && 'Logout'}
        </button>
      </div>

      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 bg-primary border border-white/20 rounded-full p-1 text-white hover:bg-primary/80 transition hidden lg:flex"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar — desktop */}
      <aside
        className={cn(
          'hidden lg:flex flex-col bg-[#0F2044] dark:bg-[#020617] relative flex-shrink-0 transition-all duration-300 no-print',
          collapsed ? 'w-[64px]' : 'w-[240px]',
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — mobile */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[240px] bg-[#0F2044] dark:bg-[#020617] lg:hidden transition-transform duration-300 no-print',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-white/70 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Top bar */}
        <header className="h-16 bg-surface border-b border-border flex items-center px-4 gap-4 flex-shrink-0 no-print">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
          >
            <Menu className="h-6 w-6" />
          </button>

          <GlobalSearch />

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user && <UserProfileMenu user={user} onLogout={handleLogout} />}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
