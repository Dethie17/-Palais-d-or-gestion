import { useState } from 'react';
import { Menu, ChefHat } from 'lucide-react';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import MenuManagement from './pages/MenuManagement';
import POSPage from './pages/POSPage';
import PaymentPage from './pages/PaymentPage';
import ReceiptPage from './pages/ReceiptPage';
import OrderHistoryPage from './pages/OrderHistoryPage';
import ProfilePage from './pages/ProfilePage';
import LoginPage from './pages/LoginPage';
import { PageName, CartItem, Order } from './types/menu';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProductProvider } from './context/ProductContext';

function AppContent() {
  const { addOrder } = useApp();
  const { isAuthenticated, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageName>('dashboard');
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
    return <LoginPage />;
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
    switch (currentPage) {
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
        return <Dashboard onNavigate={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/30 to-slate-100">
      <Sidebar currentPage={currentPage} onNavigate={navigateTo} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center px-4 gap-3 shadow-sm">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
          <Menu className="w-6 h-6 text-slate-700" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <ChefHat className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-slate-800 text-base">Palais d'Or 🍔</span>
        </div>
      </header>

      <main className="lg:ml-72 min-h-screen pt-16 lg:pt-0">
        {renderPage()}
      </main>
    </div>
  );
}

const App = () => {
  return (
    <AuthProvider>
      <ProductProvider>
        <AppProvider>
          <AppContent />
        </AppProvider>
      </ProductProvider>
    </AuthProvider>
  );
};

export default App;
