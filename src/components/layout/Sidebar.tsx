import { useState } from 'react';
import { PageName } from '@/types/menu';
import { useAuth } from '@/context/AuthContext';
import { 
  LayoutDashboard, 
  UtensilsCrossed, 
  ShoppingCart, 
  Receipt, 
  UserCircle,
  X,
  User
} from 'lucide-react';

interface SidebarProps {
  currentPage: PageName;
  onNavigate: (page: PageName) => void;
  open: boolean;
  onClose: () => void;
}

const allNavItems: { page: PageName; label: string; icon: React.ReactNode; roles: ('caissier' | 'manager')[] }[] = [
  { page: 'dashboard', label: 'Tableau de bord', icon: <LayoutDashboard className="w-5 h-5" />, roles: ['manager'] },
  { page: 'menu', label: 'Gestion Menu', icon: <UtensilsCrossed className="w-5 h-5" />, roles: ['caissier', 'manager'] },
  { page: 'pos', label: 'Caisse (POS)', icon: <ShoppingCart className="w-5 h-5" />, roles: ['caissier', 'manager'] },
  { page: 'orders', label: 'Commandes', icon: <Receipt className="w-5 h-5" />, roles: ['caissier', 'manager'] },
];

const Sidebar = ({ currentPage, onNavigate, open, onClose }: SidebarProps) => {
  const { user } = useAuth();

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
        {/* Logo */}
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-lg p-1">
            <img src="/logo.png" alt="Palais d'Or" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white tracking-tight">Palais d'Or</h1>
            <p className="text-xs text-slate-400">Gestion Restaurant Pro</p>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 mt-6 space-y-2">
          {navItems.map((item) => {
            const isActive = currentPage === item.page;
            return (
              <button
                key={item.page}
                onClick={() => handleNav(item.page)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/30 scale-[1.02]'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className={isActive ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                {item.label}
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
                {user?.role === 'manager' ? '👑 Manager' : '👤 Caissier'}
              </p>
            </div>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
