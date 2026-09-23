import { PageName } from '@/types/menu';
import { useAuth, UserRole } from '@/context/AuthContext';
import { getRoleDef } from '@/lib/roleTasks';
import OrestoLogo from '@/components/brand/OrestoLogo';
import {
  LayoutDashboard,
  UtensilsCrossed,
  ShoppingCart,
  Receipt,
  X,
  User,
  Home,
  Wallet,
  QrCode,
  ScanLine,
  Building2,
  Users,
  ClipboardList,
  Settings,
  Ticket,
} from 'lucide-react';

interface SidebarProps {
  currentPage: PageName;
  onNavigate: (page: PageName) => void;
  open: boolean;
  onClose: () => void;
}

const allNavItems: { page: PageName; label: string; icon: React.ReactNode; roles: UserRole[] }[] = [
  { page: 'home', label: 'Accueil', icon: <Home className="w-5 h-5" />, roles: ['client', 'personnel', 'gestionnaire', 'admin', 'caissier', 'manager'] },
  { page: 'menus', label: 'Menus', icon: <UtensilsCrossed className="w-5 h-5" />, roles: ['client', 'personnel', 'gestionnaire', 'admin', 'caissier', 'manager'] },
  { page: 'tickets', label: 'Tickets & formules', icon: <Ticket className="w-5 h-5" />, roles: ['personnel', 'caissier', 'gestionnaire', 'admin', 'manager'] },
  { page: 'subscription', label: 'Abonnement', icon: <Wallet className="w-5 h-5" />, roles: ['client'] },
  { page: 'subscriptions', label: 'Abonnés & paiements', icon: <Users className="w-5 h-5" />, roles: ['admin', 'gestionnaire', 'manager'] },
  { page: 'qrcode', label: 'Mon QR Code', icon: <QrCode className="w-5 h-5" />, roles: ['client'] },
  { page: 'validation', label: 'Validation repas', icon: <ScanLine className="w-5 h-5" />, roles: ['personnel', 'caissier', 'gestionnaire', 'admin', 'manager'] },
  { page: 'dashboard', label: 'Tableau de bord', icon: <LayoutDashboard className="w-5 h-5" />, roles: ['admin', 'gestionnaire', 'manager'] },
  { page: 'establishments', label: 'Établissements', icon: <Building2 className="w-5 h-5" />, roles: ['admin', 'gestionnaire', 'manager'] },
  { page: 'menu', label: 'Gestion Menu', icon: <ClipboardList className="w-5 h-5" />, roles: ['admin', 'gestionnaire', 'manager'] },
  // Caisse réservée au Gérant de cantine (le DG supervise via Abonnés & paiements)
  { page: 'pos', label: 'Caisse (POS)', icon: <ShoppingCart className="w-5 h-5" />, roles: ['gestionnaire'] },
  { page: 'users', label: 'Utilisateurs', icon: <Users className="w-5 h-5" />, roles: ['admin', 'gestionnaire', 'manager'] },
  { page: 'settings', label: 'Paramètres', icon: <Settings className="w-5 h-5" />, roles: ['admin', 'manager'] },
  { page: 'history', label: 'Historique', icon: <Receipt className="w-5 h-5" />, roles: ['client', 'personnel', 'gestionnaire', 'admin', 'caissier', 'manager'] },
];

const Sidebar = ({ currentPage, onNavigate, open, onClose }: SidebarProps) => {
  const { user } = useAuth();
  const roleDef = getRoleDef(user?.role);

  // Filtrer les items selon le rôle de l'utilisateur
  const navItems = user ? allNavItems.filter(item => item.roles.includes(user.role)) : [];

  const handleNav = (page: PageName) => {
    onNavigate(page);
    onClose();
  };

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm" onClick={onClose} />
      )}

      <aside className={`fixed left-0 top-0 bottom-0 w-72 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col z-50 transition-transform duration-300 lg:translate-x-0 shadow-2xl border-r border-white/10 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo officiel O RESTO */}
        <div className="p-4 flex items-center gap-3 border-b border-white/10 bg-white">
          <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
            <OrestoLogo variant="mark" imgClassName="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black tracking-tight leading-none">
              <span className="text-green-700">O</span> <span className="text-slate-900">RESTO</span>
            </h1>
            <p className="text-[11px] text-slate-500 font-medium leading-tight mt-1">Repas • Abonnements • QR Code</p>
            <p className="text-[10px] text-slate-400">Écoles & entreprises</p>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-slate-800 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profil connecté */}
        {user && (
          <div className="mx-3 mt-3 p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-2.5">
            <span className={`w-9 h-9 rounded-xl bg-gradient-to-br ${roleDef.color} flex items-center justify-center flex-shrink-0`}>
              <roleDef.icon className="w-5 h-5 text-white" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] font-bold text-white leading-tight truncate">{roleDef.title}</span>
              <span className="block text-[11px] text-slate-400 leading-snug capitalize truncate">{user.username}</span>
            </span>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 mt-3 space-y-1 overflow-y-auto pb-3">
          <p className="px-4 pt-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Navigation</p>
          {navItems.map((item) => {
            const isActive = currentPage === item.page;
            return (
              <button
                key={item.page}
                onClick={() => handleNav(item.page)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg shadow-green-900/40 scale-[1.02]'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className={isActive ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                <span className="flex-1 text-left leading-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={() => handleNav('profile')}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${
              currentPage === 'profile'
                ? 'bg-white/10 shadow-lg'
                : 'bg-white/5 hover:bg-white/10'
            }`}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white/10">
              <User className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-white truncate capitalize">
                {user?.username || 'Utilisateur'}
              </p>
              <p className="text-xs text-slate-300 truncate">
                {roleDef.title}
              </p>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
