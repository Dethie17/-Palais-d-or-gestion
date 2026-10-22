import { PageName } from '@/types/menu';
import { useAuth, UserRole } from '@/context/AuthContext';
import { canAccess } from '@/lib/permissions';
import OrestoLogo from '@/components/brand/OrestoLogo';
import {
  LayoutDashboard,
  UtensilsCrossed,
  ShoppingCart,
  Receipt,
  Home,
  ScanLine,
  Users,
  ClipboardList,
  Settings,
  Building2,
  MessageSquareWarning,
  FileSpreadsheet,
  Banknote,
  QrCode,
  LogOut,
} from 'lucide-react';

/**
 * Barre supérieure horizontale des espaces (Superviseur, Caissier, Espace ISM).
 * Brand + navigation horizontale des sections + Déconnexion immédiate en haut
 * à droite. L'espace parent (client) a sa propre barre dans EspaceParentPage.
 */
const NAV: { page: PageName; label: string; icon: React.ReactNode; roles: UserRole[] }[] = [
  { page: 'home', label: 'Accueil', icon: <Home aria-hidden className="w-4 h-4" />, roles: ['personnel'] },
  { page: 'dashboard', label: 'Tableau de bord', icon: <LayoutDashboard aria-hidden className="w-4 h-4" />, roles: ['personnel', 'admin'] },
  { page: 'validation', label: 'Validation repas', icon: <ScanLine aria-hidden className="w-4 h-4" />, roles: ['personnel'] },
  { page: 'menu', label: 'Gestion Menu', icon: <ClipboardList aria-hidden className="w-4 h-4" />, roles: ['personnel'] },
  { page: 'subscriptions', label: 'Abonnés & paiements', icon: <Users aria-hidden className="w-4 h-4" />, roles: ['personnel', 'admin'] },
  { page: 'reclamations', label: 'Réclamations', icon: <MessageSquareWarning aria-hidden className="w-4 h-4" />, roles: ['personnel'] },
  { page: 'qrgallery', label: 'QR Code', icon: <QrCode aria-hidden className="w-4 h-4" />, roles: ['personnel', 'admin'] },
  { page: 'users', label: 'Utilisateurs', icon: <Users aria-hidden className="w-4 h-4" />, roles: ['personnel', 'admin'] },
  { page: 'import-eleves', label: 'Import', icon: <FileSpreadsheet aria-hidden className="w-4 h-4" />, roles: ['admin'] },
  { page: 'establishments', label: 'Établissements', icon: <Building2 aria-hidden className="w-4 h-4" />, roles: ['personnel'] },
  { page: 'settings', label: 'Paramètres', icon: <Settings aria-hidden className="w-4 h-4" />, roles: ['personnel'] },
  { page: 'finance', label: 'Finance', icon: <Banknote aria-hidden className="w-4 h-4" />, roles: ['admin'] },
  { page: 'paiements', label: 'Historique paiements', icon: <Receipt aria-hidden className="w-4 h-4" />, roles: ['admin'] },
  { page: 'pos', label: 'Vente (POS)', icon: <ShoppingCart aria-hidden className="w-4 h-4" />, roles: ['gestionnaire'] },
  { page: 'menurecreation', label: 'Espace Repas', icon: <UtensilsCrossed aria-hidden className="w-4 h-4" />, roles: ['gestionnaire'] },
  { page: 'history', label: 'Historique des commandes', icon: <Receipt aria-hidden className="w-4 h-4" />, roles: ['personnel', 'gestionnaire', 'admin'] },
];

const SpaceTopNav = ({ currentPage, onNavigate }: { currentPage: PageName; onNavigate: (page: PageName) => void }) => {
  const { user, logout } = useAuth();
  const items = user
    ? NAV.filter((item) => item.roles.includes(user.role) && canAccess(user.role, item.page))
    : [];
  const isClient = user?.role === 'client';
  if (isClient || !user) return null;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-sm" data-testid="space-topnav">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-white border flex items-center justify-center overflow-hidden">
            <OrestoLogo variant="mark" imgClassName="w-full h-full object-contain" />
          </div>
          <p className="font-black tracking-tight text-slate-900 text-sm hidden md:block">
          </p>
        </div>

        <nav aria-label="Navigation de l'espace" className="flex items-center gap-1 overflow-x-auto min-w-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => {
            const isActive = currentPage === item.page;
            return (
              <button
                key={item.page}
                onClick={() => onNavigate(item.page)}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 px-3 py-2 whitespace-nowrap rounded-full text-xs font-bold transition-colors ${
                  isActive
                    ? 'bg-green-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        <button
          onClick={() => void logout()}
          data-testid="space-logout"
          className="ml-auto flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-slate-200 text-xs font-black text-slate-700 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut aria-hidden className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>
    </header>
  );
};

export default SpaceTopNav;
