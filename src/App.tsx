import { Suspense, lazy, useEffect, useState } from 'react';
import { Menu, ShieldAlert } from 'lucide-react';
import Sidebar from './components/layout/Sidebar';
import SplashScreen from './components/SplashScreen';
import ParentGate from './components/ParentGate';
import OrestoLogo from './components/brand/OrestoLogo';
import { getRoleDef } from './lib/roleTasks';
import { PageName, CartItem, Order } from './types/menu';
import { canAccess, ROLE_PAGES, PAGE_LABEL } from './lib/permissions';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RestoProvider, useResto } from './context/RestoContext';
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

const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));
const SubscriptionsAdminPage = lazy(() => import('./pages/SubscriptionsAdminPage'));
const QRCodePage = lazy(() => import('./pages/QRCodePage'));
const QrGalleryPage = lazy(() => import('./pages/QrGalleryPage'));
const ValidationPage = lazy(() => import('./pages/ValidationPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ChildrenPage = lazy(() => import('./pages/ChildrenPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const EspaceParentPage = lazy(() => import('./pages/EspaceParentPage'));

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
  const { parentProfileOf } = useResto();
  const [currentPage, setCurrentPage] = useState<PageName>('home');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Gérant sans accueil : atterrissage direct sur le tableau de bord.
  useEffect(() => {
    if (user?.role === 'gestionnaire' && currentPage === 'home') {
      setCurrentPage('dashboard');
    }
  }, [user?.role, currentPage]);

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

  // Portail parent : en guise de login, fiche nom/prénom/téléphone obligatoire
  if (user?.role === 'client' && user?.username && !parentProfileOf(user.username)) {
    return (
      <Suspense fallback={<PageLoader />}>
        <ParentGate username={user.username} />
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
        <div className="p-4 sm:p-8 max-w-lg mx-auto">
          <div className="bg-white rounded-2xl border shadow p-6 sm:p-8 text-center">
            <ShieldAlert aria-hidden className="w-12 h-12 text-red-600 mx-auto mb-3" />
            <h2 className="text-xl font-bold text-slate-800">Accès réservé</h2>
            <p className="text-sm text-slate-600 mt-2">
              Votre profil <strong>{roleDef.title}</strong> ne donne pas accès à cette page.
            </p>
            <div className="mt-4 text-left bg-slate-50 rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-600 flex items-center gap-1.5">
                <RoleIcon aria-hidden className="w-4 h-4" /> Votre périmètre — {roleDef.title}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allowedPages.map((p) => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-green-700 hover:text-green-800"
                  >
                    {PAGE_LABEL[p] ?? p}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">{roleDef.mission}</p>
            </div>
            <button
              onClick={() => setCurrentPage(allowedPages[0] ?? 'home')}
              className="btn-primary mt-5"
            >
              Aller à {PAGE_LABEL[allowedPages[0]] ?? 'l’accueil'}
            </button>
          </div>
        </div>
      );
    }
    switch (currentPage) {
      case 'home':
        // Espace Parent unifié : un seul parcours continu pour le rôle client.
        if (user?.role === 'client') return <EspaceParentPage />;
        return <HomePage onNavigate={navigateTo} />;
      case 'menus':
        if (user?.role === 'client') return <EspaceParentPage />;
        return <MenusPage onNavigate={navigateTo} />;
      case 'subscription':
        if (user?.role === 'client') return <EspaceParentPage />;
        return <SubscriptionPage onNavigate={navigateTo} />;
      case 'subscriptions':
        return <SubscriptionsAdminPage />;
      case 'qrcode':
        if (user?.role === 'client') return <EspaceParentPage />;
        return <QRCodePage />;
      case 'qrgallery':
        return <QrGalleryPage />;
      case 'validation':
        return <ValidationPage />;

      case 'users':
        return <UsersPage />;
      case 'settings':
        return <SettingsPage onNavigate={navigateTo} />;
      case 'history':
        if (user?.role === 'client') return <EspaceParentPage />;
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
      case 'children':
        if (user?.role === 'client') return <EspaceParentPage />;
        return <ChildrenPage />;
      case 'finance':
        return <FinancePage />;
      default:
        return <HomePage onNavigate={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/30 to-slate-100">
      <Sidebar currentPage={currentPage} onNavigate={navigateTo} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center px-4 gap-3 shadow-sm">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={sidebarOpen}
          aria-controls="sidebar-principale"
          className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <Menu aria-hidden className="w-6 h-6 text-slate-700" />
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
