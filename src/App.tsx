import { Suspense, lazy, useState } from 'react';
import { Menu, ShieldAlert } from 'lucide-react';
import Sidebar from './components/layout/Sidebar';
import SplashScreen from './components/SplashScreen';
import OrestoLogo from './components/brand/OrestoLogo';
import { getRoleDef } from './lib/roleTasks';
import { PageName, CartItem, Order } from './types/menu';
import { canAccess, ROLE_PAGES, PAGE_LABEL } from './lib/permissions';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RestoProvider } from './context/RestoContext';
import { ProductProvider } from './context/ProductContext';

// Chargement différé : chaque page = un chunk séparé → premier affichage rapide,
// indispensable pour un hébergement pro (Lighthouse + SEO).
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MenuManagement = lazy(() => import('./pages/MenuManagement'));
const POSPage = lazy(() => import('./pages/POSPage'));
const PaymentPage = lazy(() => import('./pages/PaymentPage'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));
const OrderHistoryPage = lazy(() => import('./pages/OrderHistoryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const MenusPage = lazy(() => import('./pages/MenusPage'));
const TicketsPage = lazy(() => import('./pages/TicketsPage'));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));
const SubscriptionsAdminPage = lazy(() => import('./pages/SubscriptionsAdminPage'));
const QRCodePage = lazy(() => import('./pages/QRCodePage'));
const ValidationPage = lazy(() => import('./pages/ValidationPage'));
const EstablishmentsPage = lazy(() => import('./pages/EstablishmentsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-green-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500 font-medium">Chargement de la page…</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { addOrder } = useApp();
  const { isAuthenticated, loading, user } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageName>('home');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Afficher un loader pendant le chargement initial
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50/20 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Chargement...</p>
        </div>
      </div>
    );
  }

  // Si non authentifié, afficher la page de login
  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    );
  }

  const navigateTo = (page: PageName) => setCurrentPage(page);

  const handleProceedToPayment = (items: CartItem[]) => {
    setCart(items);
    setCurrentPage('payment');
  };

  const handlePaymentComplete = (order: Order) => {
    // Sauvegarde de la commande dans Supabase
    addOrder(order);
    setCurrentOrder(order);
    setCart([]);
    setCurrentPage('receipt');
  };

  const handleNewOrder = () => {
    setCurrentOrder(null);
    setCart([]);
    setCurrentPage('pos');
  };

  const renderPage = () => {
    // Garde d'accès : chaque profil reste dans son périmètre (matrice des rôles)
    if (!canAccess(user?.role, currentPage)) {
      const roleDef = getRoleDef(user?.role);
      const RoleIcon = roleDef.icon;
      const allowedPages = ROLE_PAGES[user?.role ?? 'client'] ?? [];
      return (
        <div className="p-8 max-w-lg mx-auto">
          <div className="bg-white rounded-3xl border shadow p-8 text-center">
            <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-slate-800">Accès réservé</h2>
            <p className="text-sm text-slate-500 mt-2">
              Votre profil <strong>{roleDef.title}</strong> ne donne pas accès à cette page.
            </p>
            <div className="mt-4 text-left bg-slate-50 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <RoleIcon className="w-4 h-4" /> Votre périmètre — {roleDef.title}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allowedPages.map((p) => (
                  <span key={p} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border text-slate-600">
                    {PAGE_LABEL[p] ?? p}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">{roleDef.mission}</p>
            </div>
            <button
              onClick={() => setCurrentPage('home')}
              className="mt-5 px-6 py-3 rounded-xl bg-green-700 text-white font-bold text-sm hover:bg-green-800"
            >
              Retour à l’accueil
            </button>
          </div>
        </div>
      );
    }
    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={navigateTo} />;
      case 'menus':
        return <MenusPage onNavigate={navigateTo} />;
      case 'tickets':
        return <TicketsPage />;
      case 'subscription':
        return <SubscriptionPage onNavigate={navigateTo} />;
      case 'subscriptions':
        return <SubscriptionsAdminPage />;
      case 'qrcode':
        return <QRCodePage />;
      case 'validation':
        return <ValidationPage />;
      case 'establishments':
        return <EstablishmentsPage />;
      case 'users':
        return <UsersPage />;
      case 'settings':
        return <SettingsPage onNavigate={navigateTo} />;
      case 'history':
        return <OrderHistoryPage />;
      case 'dashboard':
        return <Dashboard onNavigate={navigateTo} />;
      case 'menu':
        return <MenuManagement />;
      case 'pos':
        return <POSPage onProceedToPayment={handleProceedToPayment} />;
      case 'payment':
        return <PaymentPage cart={cart} onPaymentComplete={handlePaymentComplete} onBack={() => setCurrentPage('pos')} />;
      case 'receipt':
        return <ReceiptPage order={currentOrder} onNewOrder={handleNewOrder} />;
      case 'orders':
        return <OrderHistoryPage />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <HomePage onNavigate={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/30 to-slate-100">
      <Sidebar currentPage={currentPage} onNavigate={navigateTo} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center px-4 gap-3 shadow-sm">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
          <Menu className="w-6 h-6 text-slate-700" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-white border flex items-center justify-center overflow-hidden">
            <OrestoLogo variant="mark" imgClassName="w-full h-full object-contain" />
          </div>
          <span className="font-black text-slate-800 text-base tracking-tight"><span className="text-green-700">O</span> RESTO</span>
        </div>
      </header>

      <main className="lg:ml-72 min-h-screen pt-16 lg:pt-0">
        <Suspense fallback={<PageLoader />}>{renderPage()}</Suspense>
      </main>
    </div>
  );
}

const App = () => {
  // Écran d'ouverture animé avec le logo, à chaque entrée sur le site
  const [showSplash, setShowSplash] = useState(true);
  return (
    <AuthProvider>
      <RestoProvider>
        <ProductProvider>
          <AppProvider>
            <AppContent />
            {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
          </AppProvider>
        </ProductProvider>
      </RestoProvider>
    </AuthProvider>
  );
};

export default App;
