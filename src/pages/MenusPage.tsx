import { useState } from 'react';
import { useProducts } from '@/context/ProductContext';
import { useAuth } from '@/context/AuthContext';
import { PageName } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { categories, composedMenus } from '@/data/mockData';
import TicketCard from '@/components/TicketCard';
import { CalendarDays, Ticket, Eye } from 'lucide-react';

interface MenusPageProps {
  onNavigate: (page: PageName) => void;
}

const DAY_INDEX = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const MenusPage = ({ onNavigate }: MenusPageProps) => {
  const { products } = useProducts();
  const { user } = useAuth();
  const [filter, setFilter] = useState('Tous');
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const todayName = DAY_INDEX[new Date().getDay()];

  // Rôles : seul le client achète en ligne (Wave / espèces au comptoir).
  // Personnel / gérant / DG = lecture seule (la vente comptant se fait à la Caisse POS du Gérant).
  const canBuy = user?.role === 'client';
  const isStaffReadOnly = user?.role !== 'client';

  const list = products.filter((p) => (filter === 'Tous' || p.category === filter) && p.available);
  const menuDuJour = composedMenus.find((m) => m.day === todayName);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Menus de la cantine</h1>
        <p className="text-slate-500 capitalize">Menu du {today}</p>
        {isStaffReadOnly && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
            <Eye className="w-3 h-3" /> Mode lecture : vous annoncez les plats, la vente se fait à la Caisse POS.
          </p>
        )}
        {user?.role === 'client' && (
          <p className="mt-2 text-xs text-slate-500">Choisissez un ticket → payez (Wave / espèces) → présentez votre QR.</p>
        )}
      </div>

      {/* Menu du jour mis en avant */}
      {menuDuJour ? (
        <div>
          <p className="font-bold text-slate-800 mb-2 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-green-700" /> Servi aujourd’hui — {menuDuJour.day}</p>
          <div className="max-w-md">
            <TicketCard
              day={menuDuJour.day}
              name={menuDuJour.name}
              description={menuDuJour.description}
              image={menuDuJour.image}
              items={menuDuJour.items}
              total={menuDuJour.total}
              highlight
              action={canBuy ? (
                <button onClick={() => onNavigate('subscription')} className="w-full flex items-center justify-center gap-1 px-4 py-2.5 rounded-xl bg-green-700 text-white text-sm font-bold hover:bg-green-800">
                  <Ticket className="w-4 h-4" /> Acheter ce ticket
                </button>
              ) : (
                <span className="block text-center text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-2.5 rounded-xl">Lecture seule</span>
              )}
            />
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-green-700 to-orange-600 rounded-2xl p-5 text-white shadow">
          <p className="font-bold flex items-center gap-2"><CalendarDays className="w-5 h-5" /> Pas de service aujourd’hui</p>
          <p className="text-sm opacity-90">La cantine sert du lundi au vendredi. Voici les menus de la semaine :</p>
        </div>
      )}

      {/* Semaine complète */}
      <div>
        <p className="font-bold text-slate-800 mb-2">Menus de la semaine (Lun → Ven)</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {composedMenus.filter((m) => m.day !== todayName).map((m) => (
            <TicketCard
              key={m.id}
              day={m.day}
              name={m.name}
              description={m.description}
              image={m.image}
              items={m.items}
              total={m.total}
              action={canBuy ? (
                <button onClick={() => onNavigate('subscription')} className="w-full flex items-center justify-center gap-1 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700">
                  <Ticket className="w-4 h-4" /> Ticket
                </button>
              ) : undefined}
            />
          ))}
        </div>
      </div>

      <h2 className="font-bold text-slate-800 pt-2">Carte à l’unité</h2>

      <div className="flex gap-2 flex-wrap">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`px-4 py-2 rounded-full text-sm font-semibold ${filter === c ? 'bg-green-700 text-white' : 'bg-white border text-slate-600'}`}
          >
            {c}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border text-slate-500">
          Aucun plat disponible pour ce filtre aujourd’hui.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl overflow-hidden border shadow-sm">
              {p.image && <img src={p.image} alt={p.name} className="h-36 w-full object-cover" />}
              <div className="p-4">
                <p className="text-xs font-semibold text-green-700 uppercase">{p.category}</p>
                <h3 className="font-bold text-slate-800">{p.name}</h3>
                {p.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{p.description}</p>}
                <p className="mt-2 font-extrabold text-slate-800">{formatCurrency(p.price)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MenusPage;
