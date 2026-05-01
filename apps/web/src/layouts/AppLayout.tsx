import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Users, UserCog, Warehouse,
  Truck, Activity, BarChart3, Settings, RefreshCw, ClipboardList,
  LogOut, ChevronLeft, ChevronRight, Menu, X, Scan, User,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore.ts';
import { cn } from '../utils/cn.ts';
import api from '../lib/axios.ts';
import { usePermission } from '../hooks/usePermission.ts';

const navItems = [
  { href: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { href: '/app/dispatch', icon: Activity, label: 'Dispatch', permission: 'dashboard:supervisor' as const },
  { href: '/scan', icon: Scan, label: 'Scan App', permission: 'scan:operate' as const },
  { href: '/app/orders', icon: ShoppingCart, label: 'Orders', permission: 'orders:view' as const },
  { href: '/app/products', icon: Package, label: 'Products', permission: 'products:view' as const },
  { href: '/app/clients', icon: Users, label: 'Clients', permission: 'clients:view' as const },
  { href: '/app/inventory', icon: Warehouse, label: 'Inventory', permission: 'inventory:view' as const },
  { href: '/app/vehicles', icon: Truck, label: 'Vehicles', permission: 'vehicles:view' as const },
  { href: '/app/tally', icon: RefreshCw, label: 'Tally Sync', permission: 'tally:view' as const },
  { href: '/app/reports', icon: BarChart3, label: 'Reports', permission: 'reports:view' as const },
  { href: '/app/audit', icon: ClipboardList, label: 'Audit Log', permission: 'audit:view' as const },
  { href: '/app/settings', icon: Settings, label: 'Account' },
  { href: '/app/users', icon: UserCog, label: 'Users', permission: 'users:manage' as const },
];

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

  const filteredNavItems = navItems.filter((item) =>
    !item.permission || permissionMap[item.permission],
  );

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
            <p className="text-white/50 text-xs">Dispatch System</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {filteredNavItems.map((item) => (
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
          'hidden lg:flex flex-col bg-primary relative flex-shrink-0 transition-all duration-300',
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
          'fixed inset-y-0 left-0 z-50 w-[240px] bg-primary lg:hidden transition-transform duration-300',
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-4 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-700">
              <User className="h-4 w-4 text-gray-400" />
              <span className="font-medium">{user?.name}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
