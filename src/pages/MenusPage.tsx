import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { PageName } from '@/types/menu';
import { menuTicketTotal, publishedDays } from '@/lib/menus';
import TicketCard from '@/components/TicketCard';
import { CalendarDays, Ticket, Eye } from 'lucide-react';

interface MenusPageProps {
  onNavigate: (page: PageName) => void;
}

const DAY_INDEX = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const MenusPage = ({ onNavigate }: MenusPageProps) => {
  const { user } = useAuth();
  const { weeklyMenus } = useResto();
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const todayName = DAY_INDEX[new Date().getDay()];

  // Rôles : seul le client achète en ligne (Wave / espèces au comptoir).
  // Personnel / caissier / DG = lecture seule (la vente comptant se fait à la Caisse POS du Caissier).
  const canBuy = user?.role === 'client';
  const isStaffReadOnly = user?.role !== 'client';

  // Seuls les jours composés par le DG (au moins un plat) sont affichés.
  // Semaine vide tant que rien n'est publié → bel état vide, aucune fausse liste.
  const published = publishedDays(weeklyMenus);
  const menuDuJour = published.find((m) => m.day === todayName);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Menu de la semaine</h1>
        <p className="text-slate-500">Du lundi au vendredi · service du midi · {today}</p>
        {isStaffReadOnly && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
            <Eye className="w-3 h-3" /> Mode lecture : vous annoncez les plats, la vente se fait à la Caisse POS.
          </p>
        )}
        {user?.role === 'client' && (
          <p className="mt-2 text-xs text-slate-500">Choisissez un ticket → payez (Wave / espèces) → présentez votre QR.</p>
        )}
      </div>

      {/* Semaine publiée par le DG — vide pro tant que rien n'est composé */}
      {published.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 md:p-14 text-center shadow-sm">
          <span className="w-16 h-16 rounded-3xl bg-slate-100 inline-flex items-center justify-center">
            <CalendarDays className="w-8 h-8 text-slate-500" />
          </span>
          <p className="mt-4 text-xl font-black text-slate-800">Menus en préparation</p>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
            La cantine compose les menus de la semaine — service du midi, du lundi au vendredi.
            Revenez bientôt.
          </p>
        </div>
      ) : (
        <>
          {menuDuJour ? (
            <div>
              <p className="font-bold text-slate-800 mb-2 flex items-center gap-2"><CalendarDays className="w-5 h-5 text-green-700" /> Servi aujourd’hui — {menuDuJour.day}</p>
              <div className="max-w-md">
                <TicketCard
                  day={menuDuJour.day}
                  name={menuDuJour.name || `Menu du ${menuDuJour.day}`}
                  description={menuDuJour.description}
                  items={menuDuJour.items}
                  total={menuTicketTotal(menuDuJour)}
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
            <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl px-4 py-3">
              Pas de service aujourd’hui — la cantine sert du lundi au vendredi. Voici les jours publiés :
            </p>
          )}

          <div>
            <p className="font-bold text-slate-800 mb-2">Menus publiés ({published.length}/5)</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {published.map((m) => (
                <TicketCard
                  key={m.day}
                  day={m.day}
                  name={m.name || `Menu du ${m.day}`}
                  description={m.description}
                  items={m.items}
                  total={menuTicketTotal(m)}
                  action={canBuy ? (
                    <button onClick={() => onNavigate('subscription')} className="w-full flex items-center justify-center gap-1 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700">
                      <Ticket className="w-4 h-4" /> Ticket
                    </button>
                  ) : undefined}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MenusPage;
