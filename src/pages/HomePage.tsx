import { PageName } from '@/types/menu';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { useProducts } from '@/context/ProductContext';
import { composedMenus } from '@/data/mockData';
import { formatCurrency } from '@/lib/utils';
import {
  QrCode, UtensilsCrossed, Wallet, History, MapPin, CalendarDays,
  ScanLine, LayoutDashboard, Building2, Users, Banknote, ArrowRight,
  CheckCircle, XCircle, Ticket,
} from 'lucide-react';

interface HomePageProps {
  onNavigate: (page: PageName) => void;
}

type RoleFamily = 'client' | 'personnel' | 'gestionnaire' | 'admin';

function familyOf(role?: string): RoleFamily {
  if (role === 'personnel' || role === 'caissier') return 'personnel';
  if (role === 'gestionnaire') return 'gestionnaire';
  if (role === 'admin' || role === 'manager') return 'admin';
  return 'client';
}

const FAMILY_STYLE: Record<RoleFamily, { gradient: string; badge: string; title: string; subtitle: string }> = {
  client: {
    gradient: 'from-blue-600 to-indigo-700',
    badge: 'Espace client',
    title: 'Bon appétit',
    subtitle: 'Vos menus, tickets et QR Code au même endroit.',
  },
  personnel: {
    gradient: 'from-emerald-600 to-teal-700',
    badge: 'Espace service',
    title: 'En service',
    subtitle: 'Validez les QR Code et faites passer tout le monde vite.',
  },
  gestionnaire: {
    gradient: 'from-violet-600 to-purple-700',
    badge: 'Ma cantine',
    title: 'Pilotage du jour',
    subtitle: 'Repas servis, abonnements, caisse et menus de votre cantine.',
  },
  admin: {
    gradient: 'from-orange-500 to-red-600',
    badge: 'Pilotage O RESTO',
    title: 'Toute la plateforme',
    subtitle: 'Clients, repas, paiements : tout en un coup d’œil.',
  },
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const HomePage = ({ onNavigate }: HomePageProps) => {
  const { user } = useAuth();
  const { mySubscription, formulas, establishments, validations, subscriptions, stats } = useResto();
  const { products } = useProducts();

  const family = familyOf(user?.role);
  const style = FAMILY_STYLE[family];
  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const dayIdx = new Date().getDay();
  const menuDuJour = composedMenus[dayIdx >= 1 && dayIdx <= 5 ? dayIdx - 1 : 0];
  const todayValidations = validations.filter((v) => sameDay(new Date(v.validatedAt), new Date()));
  const acceptedToday = todayValidations.filter((v) => v.status === 'accepted');
  const rejectedToday = todayValidations.filter((v) => v.status === 'rejected');

  const sub = user ? mySubscription(user.username) : undefined;
  const formula = formulas.find((f) => f.id === sub?.formulaId);
  const myMeals = user ? validations.filter((v) => v.clientUsername === user.username && v.status === 'accepted').length : 0;
  const nextMenu = products.filter((p) => p.available).slice(0, 3);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Bannière d'accueil par profil */}
      <div className={`bg-gradient-to-r ${style.gradient} rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden`}>
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/10 rounded-full blur-2xl" />
        <span className="inline-block text-xs font-bold bg-white/20 px-3 py-1 rounded-full">{style.badge}</span>
        <h1 className="text-2xl md:text-3xl font-bold mt-2 capitalize">
          {style.title}, {user?.username}
        </h1>
        <p className="text-sm opacity-90 mt-1">{style.subtitle}</p>
        <p className="text-xs opacity-75 mt-2 capitalize">{todayLabel}</p>
      </div>

      {family === 'client' && (
        <>
          <MenuDuJourCard menu={menuDuJour} actionLabel="Acheter le ticket" onAction={() => onNavigate('subscription')} />

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow border">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Wallet className="w-4 h-4" /> Mon abonnement</div>
              {sub && formula ? (
                <div className="mt-2">
                  <p className="text-lg font-bold">{formula.name}</p>
                  <p className="text-3xl font-extrabold text-blue-600">{sub.mealsRemaining} repas</p>
                  <p className="text-xs text-slate-500">Expire le {new Date(sub.endDate).toLocaleDateString('fr-FR')}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Aucun abonnement actif.</p>
              )}
              <button onClick={() => onNavigate('subscription')} className="mt-3 w-full py-2 rounded-xl bg-blue-100 text-blue-700 font-semibold text-sm hover:bg-blue-200">
                {sub ? 'Recharger / renouveler' : 'Choisir une formule'}
              </button>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow border">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><UtensilsCrossed className="w-4 h-4" /> À la carte</div>
              <div className="mt-2 space-y-1">
                {nextMenu.length === 0 && <p className="text-sm text-slate-500">Carte en cours de publication.</p>}
                {nextMenu.map((p) => (
                  <p key={p.id} className="text-sm flex items-center gap-1.5"><UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" /> {p.name} — <span className="font-semibold">{formatCurrency(p.price)}</span></p>
                ))}
              </div>
              <button onClick={() => onNavigate('menus')} className="mt-3 w-full py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200">
                Voir tout le catalogue
              </button>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow border border-indigo-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><History className="w-4 h-4" /> Ma consommation</div>
              <p className="text-3xl font-extrabold mt-2">{myMeals} repas</p>
              <p className="text-xs text-slate-500">déjà savourés</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => onNavigate('qrcode')} className="py-2 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 flex items-center justify-center gap-1">
                  <QrCode className="w-4 h-4" /> Mon QR
                </button>
                <button onClick={() => onNavigate('history')} className="py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200">
                  Historique
                </button>
              </div>
            </div>
          </div>

          <EtablissementsCard />
        </>
      )}

      {family === 'personnel' && (
        <>
          <button
            onClick={() => onNavigate('validation')}
            className="w-full bg-white border-2 border-emerald-200 rounded-3xl p-6 shadow flex items-center gap-4 hover:border-emerald-400 hover:shadow-lg transition-all text-left"
          >
            <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
              <ScanLine className="w-8 h-8 text-white" />
            </span>
            <span>
              <span className="block text-xl font-bold text-slate-800">Valider un repas</span>
              <span className="block text-sm text-slate-500">Scanner ou saisir le QR du client → contrôle automatique</span>
            </span>
            <ArrowRight className="w-6 h-6 text-emerald-600 ml-auto" />
          </button>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow border">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><CheckCircle className="w-4 h-4 text-green-600" /> Servis aujourd’hui</div>
              <p className="text-4xl font-extrabold text-green-600 mt-1">{acceptedToday.length}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow border">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><XCircle className="w-4 h-4 text-red-500" /> Refusés</div>
              <p className="text-4xl font-extrabold text-red-500 mt-1">{rejectedToday.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow border">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-800">Derniers passages</p>
              <button onClick={() => onNavigate('validation')} className="text-sm font-semibold text-emerald-600">Tout voir →</button>
            </div>
            {todayValidations.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">Aucun passage enregistré pour le moment.</p>
            ) : (
              <ul className="mt-2 divide-y text-sm">
                {todayValidations.slice(-5).reverse().map((v) => (
                  <li key={v.id} className="py-2 flex items-center justify-between">
                    <span className="font-semibold">{v.clientUsername} <span className="font-normal text-slate-400">• {new Date(v.validatedAt).toLocaleTimeString('fr-FR')}</span></span>
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${v.status === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {v.status === 'accepted' ? 'Servi' : 'Refusé'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <MenuDuJourCard menu={menuDuJour} actionLabel="Voir le catalogue" onAction={() => onNavigate('menus')} />
        </>
      )}

      {family === 'gestionnaire' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Repas servis (jour)" value={acceptedToday.length} />
            <StatCard label="Abonnements actifs" value={stats.activeClients} />
            <StatCard label="Établissements" value={establishments.length} />
            <StatCard label="Plats à la carte" value={products.filter((p) => p.available).length} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <QuickLink title="Caisse (POS)" desc="Vente directe au comptant" icon={<Banknote className="w-6 h-6 text-white" />} gradient="from-violet-500 to-purple-600" onClick={() => onNavigate('pos')} />
            <QuickLink title="Tickets & formules" desc="Catalogue complet + vente au comptoir" icon={<Ticket className="w-6 h-6 text-white" />} gradient="from-orange-500 to-red-600" onClick={() => onNavigate('tickets')} />
            <QuickLink title="Valider les repas" desc={`${acceptedToday.length} servis • ${rejectedToday.length} refusés aujourd’hui`} icon={<ScanLine className="w-6 h-6 text-white" />} gradient="from-emerald-500 to-teal-600" onClick={() => onNavigate('validation')} />
            <QuickLink title="Gérer les menus" desc={`${products.length} plats au catalogue`} icon={<UtensilsCrossed className="w-6 h-6 text-white" />} gradient="from-violet-500 to-purple-600" onClick={() => onNavigate('menu')} />
            <QuickLink title="Tableau de bord" desc="Stats, graphiques et alertes" icon={<LayoutDashboard className="w-6 h-6 text-white" />} gradient="from-orange-500 to-red-600" onClick={() => onNavigate('dashboard')} />
          </div>

          <MenuDuJourCard menu={menuDuJour} actionLabel="Voir le catalogue" onAction={() => onNavigate('menus')} />
        </>
      )}

      {family === 'admin' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Clients actifs" value={stats.activeClients} icon={<Users className="w-4 h-4" />} />
            <StatCard label="Repas du jour" value={stats.mealsToday} icon={<UtensilsCrossed className="w-4 h-4" />} />
            <StatCard label="CA tickets & abos" value={formatCurrency(stats.revenue)} icon={<Banknote className="w-4 h-4" />} />
            <StatCard label="Abonnements total" value={subscriptions.length} icon={<Wallet className="w-4 h-4" />} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <QuickLink title="Tableau de bord" desc="Graphiques, top produits, export PDF" icon={<LayoutDashboard className="w-6 h-6 text-white" />} gradient="from-orange-500 to-red-600" onClick={() => onNavigate('dashboard')} />
            <QuickLink title="Validation des repas" desc={`${todayValidations.length} passages aujourd’hui`} icon={<ScanLine className="w-6 h-6 text-white" />} gradient="from-emerald-500 to-teal-600" onClick={() => onNavigate('validation')} />
            <QuickLink title="Établissements & menus" desc={`${establishments.length} sites • ${products.length} plats`} icon={<Building2 className="w-6 h-6 text-white" />} gradient="from-blue-500 to-indigo-600" onClick={() => onNavigate('establishments')} />
            <QuickLink title="Abonnés & paiements" desc="Encaissements Wave, espèces" icon={<Users className="w-6 h-6 text-white" />} gradient="from-violet-500 to-purple-600" onClick={() => onNavigate('subscriptions')} />
          </div>

          <EtablissementsCard />
        </>
      )}
    </div>
  );

  function EtablissementsCard() {
    return (
      <div className="bg-white rounded-2xl p-5 shadow border">
        <div className="flex items-center gap-2 font-bold text-slate-800"><MapPin className="w-5 h-5 text-orange-500" /> Établissements partenaires</div>
        <div className="mt-2 grid md:grid-cols-2 gap-2">
          {establishments.map((e) => (
            <div key={e.id} className="p-3 rounded-xl bg-slate-50 border text-sm">
              <p className="font-semibold">{e.name}</p>
              <p className="text-slate-500">{e.address}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
};

function MenuDuJourCard({ menu, actionLabel, onAction }: { menu: (typeof composedMenus)[number]; actionLabel: string; onAction: () => void }) {
  return (
    <div className="bg-white rounded-2xl shadow border border-orange-100 overflow-hidden">
      {menu.image && (
        <div className="relative h-40">
          <img src={menu.image} alt={`${menu.name} — ${menu.day}`} loading="lazy" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <p className="absolute bottom-2 left-4 text-white font-bold flex items-center gap-2 drop-shadow">
            <CalendarDays className="w-5 h-5" /> Menu du jour — {menu.day} : {menu.name}
          </p>
        </div>
      )}
      <div className="p-5">
      {!menu.image && (
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <CalendarDays className="w-5 h-5 text-orange-500" /> Menu du jour — {menu.day} : {menu.name}
        </div>
      )}
      <ul className="mt-2 space-y-1 text-sm">
        {menu.items.map((it) => (
          <li key={it.name} className="flex justify-between"><span className="flex items-center gap-1.5"><UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" /> {it.name}</span><span className="font-semibold">{formatCurrency(it.price)}</span></li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between">
        <p className="font-extrabold text-lg">{formatCurrency(menu.total)}</p>
        <button onClick={onAction} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600">
          {actionLabel}
        </button>
      </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow border">
      <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">{icon}{label}</div>
      <p className="text-2xl md:text-3xl font-extrabold text-slate-800 mt-1">{value}</p>
    </div>
  );
}

function QuickLink({ title, desc, icon, gradient, onClick }: { title: string; desc: string; icon: React.ReactNode; gradient: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-white rounded-2xl p-5 shadow border flex items-center gap-4 text-left hover:shadow-lg hover:scale-[1.01] transition-all">
      <span className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0`}>{icon}</span>
      <span>
        <span className="block font-bold text-slate-800">{title}</span>
        <span className="block text-xs text-slate-500 mt-0.5">{desc}</span>
      </span>
      <ArrowRight className="w-5 h-5 text-slate-300 ml-auto flex-shrink-0" />
    </button>
  );
}

export default HomePage;
