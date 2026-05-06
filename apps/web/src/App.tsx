import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { useAuthStore } from './store/authStore.ts';
import { AppLayout } from './layouts/AppLayout.tsx';
import { LoadingSpinner } from './components/ui/LoadingSpinner.tsx';

// Public pages
const LoginPage = lazy(() => import('./pages/login/LoginPage.tsx'));
const PODPage = lazy(() => import('./pages/pod/PODPage.tsx'));

// Protected pages
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage.tsx'));
const OrderListPage = lazy(() => import('./pages/orders/OrderListPage.tsx'));
const OrderDetailPage = lazy(() => import('./pages/orders/OrderDetailPage.tsx'));
const CreateOrderPage = lazy(() => import('./pages/orders/CreateOrderPage.tsx'));
const ProductListPage = lazy(() => import('./pages/products/ProductListPage.tsx'));
const ProductDetailPage = lazy(() => import('./pages/products/ProductDetailPage.tsx'));
const CreateProductPage = lazy(() => import('./pages/products/CreateProductPage.tsx'));
const EditProductPage = lazy(() => import('./pages/products/EditProductPage.tsx'));
const ProductPrintPage = lazy(() => import('./pages/products/ProductPrintPage.tsx'));
const ClientListPage = lazy(() => import('./pages/clients/ClientListPage.tsx'));
const StockViewPage = lazy(() => import('./pages/inventory/StockViewPage.tsx'));
const GRNCreatePage = lazy(() => import('./pages/inventory/GRNCreatePage.tsx'));
const GRNListPage = lazy(() => import('./pages/inventory/GRNListPage.tsx'));
const GRNDetailPage = lazy(() => import('./pages/inventory/GRNDetailPage.tsx'));
const VehicleListPage = lazy(() => import('./pages/vehicles/VehicleListPage.tsx'));
const VehicleHistoryPage = lazy(() => import('./pages/vehicles/VehicleHistoryPage.tsx'));
const DispatchDashboard = lazy(() => import('./pages/dispatch/DispatchDashboard.tsx'));
const SessionDetailPage = lazy(() => import('./pages/dispatch/SessionDetailPage.tsx'));
const TallySyncPage = lazy(() => import('./pages/tally/TallySyncPage.tsx'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage.tsx'));
const AuditLogPage = lazy(() => import('./pages/audit/AuditLogPage.tsx'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage.tsx'));
const UserListPage = lazy(() => import('./pages/users/UserListPage.tsx'));
const UserDetailPage = lazy(() => import('./pages/users/UserDetailPage.tsx'));
const ScannerDevicesPage = lazy(() => import('./pages/devices/ScannerDevicesPage.tsx'));
const DeviceDetailPage = lazy(() => import('./pages/devices/DeviceDetailPage.tsx'));
const PODListPage = lazy(() => import('./pages/pod/PODListPage.tsx'));

// Scan pages (full-screen, no layout)
const ScanSessionSelectPage = lazy(() => import('./pages/scan/ScanSessionSelectPage.tsx'));
const ActiveScanPage = lazy(() => import('./pages/scan/ActiveScanPage.tsx'));
const SessionCompletePage = lazy(() => import('./pages/scan/SessionCompletePage.tsx'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/app/dashboard" replace />;
  return <>{children}</>;
}

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-surface">
    <LoadingSpinner size="lg" />
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/pod/:token" element={<PODPage />} />

          {/* Scan routes — full screen, no app chrome */}
          <Route path="/scan" element={<ProtectedRoute><ScanSessionSelectPage /></ProtectedRoute>} />
          <Route path="/scan/:sessionId" element={<ProtectedRoute><ActiveScanPage /></ProtectedRoute>} />
          <Route path="/scan/:sessionId/complete" element={<ProtectedRoute><SessionCompletePage /></ProtectedRoute>} />

          {/* Protected app routes with layout */}
          <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="orders" element={<OrderListPage />} />
            <Route path="orders/new" element={<CreateOrderPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="products" element={<ProductListPage />} />
            <Route path="products/new" element={<CreateProductPage />} />
            <Route path="products/:id" element={<ProductDetailPage />} />
            <Route path="products/:id/edit" element={<EditProductPage />} />
            <Route path="clients" element={<ClientListPage />} />
            <Route path="inventory" element={<StockViewPage />} />
            <Route path="inventory/grn" element={<GRNListPage />} />
            <Route path="inventory/grn/new" element={<GRNCreatePage />} />
            <Route path="inventory/grn/:id" element={<GRNDetailPage />} />
            <Route path="vehicles" element={<VehicleListPage />} />
            <Route path="vehicles/:id/history" element={<VehicleHistoryPage />} />
            <Route path="dispatch" element={<DispatchDashboard />} />
            <Route path="sessions/:id" element={<SessionDetailPage />} />
            <Route path="tally" element={<TallySyncPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="users" element={<UserListPage />} />
            <Route path="users/:id" element={<UserDetailPage />} />
            <Route path="devices" element={<ScannerDevicesPage />} />
            <Route path="devices/:id" element={<DeviceDetailPage />} />
            <Route path="pod" element={<PODListPage />} />
          </Route>

          {/* Standalone Print Route (No Layout) */}
          <Route path="/app/products/:id/print" element={<ProtectedRoute><ProductPrintPage /></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
