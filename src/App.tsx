import { Suspense, lazy, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import SpaceTopNav from './components/layout/SpaceTopNav';
import SplashScreen from './components/SplashScreen';
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

const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));
const SubscriptionsAdminPage = lazy(() => import('./pages/SubscriptionsAdminPage'));
const QRCodePage = lazy(() => import('./pages/QRCodePage'));
const ParentQrPage = lazy(() => import('./pages/ParentQrPage'));
const QrGalleryPage = lazy(() => import('./pages/QrGalleryPage'));
const ValidationPage = lazy(() => import('./pages/ValidationPage'));
const ComplaintsPage = lazy(() => import('./pages/ComplaintsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const EstablishmentsPage = lazy(() => import('./pages/EstablishmentsPage'));
const ChildrenPage = lazy(() => import('./pages/ChildrenPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const EspaceParentPage = lazy(() => import('./pages/EspaceParentPage'));
const MenuRecreationPage = lazy(() => import('./pages/MenuRecreationPage'));
const PaymentSuccessPage = lazy(() => import('./pages/PaymentSuccessPage'));
const PaymentFailurePage = lazy(() => import('./pages/PaymentFailurePage'));
const SycaPayReturnPage = lazy(() => import('./pages/SycaPayReturnPage'));
const ImportElevesPage = lazy(() => import('./pages/ImportElevesPage'));
const HistoriquePaiementsPage = lazy(() => import('./pages/HistoriquePaiementsPage'));

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
  // La donnée métier est chargée par RestoProvider ; aucune fiche secondaire
  // ne doit empêcher un parent Auth valide d'entrer dans son espace.
  const [currentPage, setCurrentPage] = useState<PageName>('home');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);

  // Gestion des URLs directes (ex: /paiement/success, /paiement/echec)
  const [intendedPath, setIntendedPath] = useState<string | null>(null);
  // Retour opérateur SycaPay : l'opérateur ramène le client sur
  // /paiement/sycapay/ok?ref=… ou /paiement/sycapay/echec?ref=… .
  // Ces écrans tournent AVANT la garde de connexion et de rôle : un client
  // qui revient du paiement sans session valide doit quand même voir où en
  // est son règlement, pas un formulaire de login.
  const [sycaPayReturn, setSycaPayReturn] = useState<'ok' | 'echec' | null>(null);
  useEffect(() => {
    const path = window.location.pathname.replace(/\/+$/, '');
    if (path === '/paiement/success') {
      setCurrentPage('paymentsuccess');
      setIntendedPath('paymentsuccess');
    } else if (path === '/paiement/echec') {
      setCurrentPage('paymentfailure');
      setIntendedPath('paymentfailure');
    } else if (path === '/paiement/sycapay/ok') {
      setSycaPayReturn('ok');
    } else if (path === '/paiement/sycapay/echec') {
      setSycaPayReturn('echec');
    }
  }, []);

  // Après login, retourner à la page demandée
  useEffect(() => {
    if (isAuthenticated && intendedPath) {
      setCurrentPage(intendedPath as PageName);
      setIntendedPath(null);
      // Nettoyer l'URL du navigateur
      window.history.replaceState({}, '', '/');
    }
  }, [isAuthenticated, intendedPath]);

  // Sans accueil : Caissier et DG atterrissent direct sur le tableau de bord.
  useEffect(() => {
    // Point d'entrée selon l'espace : l'Espace ISM tombe sur le pilotage,
    // le caissier directement sur sa caisse.
    if (user?.role === 'admin' && currentPage === 'home') {
      setCurrentPage('dashboard');
    } else if (user?.role === 'gestionnaire' && (currentPage === 'home' || currentPage === 'dashboard')) {
      setCurrentPage('pos');
    }
  }, [user?.role, currentPage]);

  const navigateTo = (page: PageName) => setCurrentPage(page);

  // Retour opérateur : rendu prioritaire, avant le login et la garde de rôle.
  // Le client vient de payer — ou de tenter de payer — et son session peut
  // être expirée : on ne lui demande pas de se reconnecter avant de lui dire
  // où en est sa commande.
  if (sycaPayReturn) {
    return (
      <Suspense fallback={<PageLoader />}>
        <SycaPayReturnPage outcome={sycaPayReturn} onNavigate={navigateTo} />
      </Suspense>
    );
  }

  // Afficher un loader pendant le chargement initial
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-50/20 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-slate-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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

  // Les parents authentifiés accèdent directement à leur espace. La présence
  // de parent_profiles n'est pas un prérequis de connexion : le serveur Auth
  // et la table users sont la source de vérité. Le portail de saisie de nom
  // ne doit plus bloquer les 25 parents déjà enregistrés par la DAF.

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
        if (user?.role === 'client') return <EspaceParentPage onNavigate={navigateTo} />;
        return <HomePage onNavigate={navigateTo} />;
      case 'menus':
        if (user?.role === 'client') return <EspaceParentPage onNavigate={navigateTo} />;
        return <MenusPage onNavigate={navigateTo} />;
      case 'subscription':
        if (user?.role === 'client') return <EspaceParentPage onNavigate={navigateTo} />;
        return <SubscriptionPage onNavigate={navigateTo} />;
      case 'subscriptions':
        return <SubscriptionsAdminPage />;
      case 'qrcode':
        if (user?.role === 'client') return <ParentQrPage />;
        return <QRCodePage />;
      case 'qrgallery':
        return <QrGalleryPage />;
      case 'validation':
        return <ValidationPage />;
      case 'reclamations':
        return <ComplaintsPage />;

      case 'users':
        return <UsersPage />;
      case 'import-eleves':
        if (user?.role !== 'admin') return <HomePage onNavigate={navigateTo} />;
        return <ImportElevesPage />;
      case 'paiements':
        return <HistoriquePaiementsPage />;
      case 'establishments':
        return <EstablishmentsPage />;
      case 'settings':
        return <SettingsPage onNavigate={navigateTo} />;
      case 'history':
        if (user?.role === 'client') return <EspaceParentPage onNavigate={navigateTo} />;
        return <OrderHistoryPage />;
      case 'dashboard':
        return <Dashboard onNavigate={navigateTo} />;
      case 'menu':
        return <MenuManagement />;
      case 'pos':
        // Vente réglée par carte prépayée → même tunnel qu'une vente classique :
        // commande enregistrée puis page Reçu imprimable.
        return (
          <POSPage
            onProceedToPayment={handleProceedToPayment}
            onCardSaleComplete={handlePaymentComplete}
          />
        );
      case 'payment':
        return <PaymentPage cart={cart} onPaymentComplete={handlePaymentComplete} onBack={() => setCurrentPage('pos')} />;
      case 'receipt':
        return <ReceiptPage order={currentOrder} onNewOrder={handleNewOrder} />;
      case 'orders':
        return <OrderHistoryPage />;
      case 'profile':
        return <ProfilePage />;
      case 'children':
        if (user?.role === 'client') return <EspaceParentPage onNavigate={navigateTo} />;
        return <ChildrenPage />;
      case 'finance':
        return <FinancePage />;
      case 'menurecreation':
        return <MenuRecreationPage onNavigate={navigateTo} />;
      case 'paymentsuccess':
        return <PaymentSuccessPage onNavigate={navigateTo} />;
      case 'paymentfailure':
        return <PaymentFailurePage onNavigate={navigateTo} />;
      default:
        return <HomePage onNavigate={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50/30 to-slate-100">
      <SpaceTopNav currentPage={currentPage} onNavigate={navigateTo} />

      <main className="min-h-screen">
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
