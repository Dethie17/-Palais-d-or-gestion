import { PageName } from '@/types/menu';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { useProducts } from '@/context/ProductContext';
import { formatCurrency } from '@/lib/utils';
import { weeklyMenuTotal, publishedDays } from '@/lib/menus';
import { isOfficialFormula } from '@/lib/formulas';
import {
  QrCode, UtensilsCrossed, Wallet, History, CalendarDays,
  LayoutDashboard, Users, Banknote, ArrowRight, Clock,
  CheckCircle, XCircle, Ticket, Baby,
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
    gradient: 'from-green-700 to-emerald-600',
    badge: 'Espace parents',
    title: 'Bon appétit',
    subtitle: '',
  },
  personnel: {
    gradient: 'from-emerald-600 to-teal-700',
    badge: 'Espace service',
    title: 'En service',
    subtitle: 'Validez les QR Code et faites passer tout le monde vite.',
  },
  gestionnaire: {
    gradient: 'from-slate-800 to-slate-900',
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
  const { formulas, validations, subscriptions, payments, parentProfiles, stats, myChildren, weeklyMenus } = useResto();
  const { products } = useProducts();

  const family = familyOf(user?.role);
  const style = FAMILY_STYLE[family];
  const todayLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  const dayIdx = new Date().getDay();
  const isServiceDay = dayIdx >= 1 && dayIdx <= 5;
  const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const todayName = DAY_NAMES[dayIdx];
  const published = publishedDays(weeklyMenus);
  const menuDuJour = isServiceDay
    ? (published.find((m) => m.day === todayName) ?? published[0] ?? null)
    : null;
  const todayValidations = validations.filter((v) => sameDay(new Date(v.validatedAt), new Date()));
  const acceptedToday = todayValidations.filter((v) => v.status === 'accepted');
  const rejectedToday = todayValidations.filter((v) => v.status === 'rejected');

  const myMeals = user ? validations.filter((v) => v.clientUsername === user.username && v.status === 'accepted').length : 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Bannière d'accueil premium par profil */}
      <div className={`bg-gradient-to-br ${style.gradient} rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden`}>
        <div className="absolute -right-12 -top-12 w-56 h-56 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute -left-8 -bottom-16 w-56 h-56 bg-black/20 rounded-full blur-3xl" />
        <div className="absolute right-6 top-1/2 -translate-y-1/2 hidden md:block opacity-20">
          <UtensilsCrossed className="w-32 h-32 text-white" />
        </div>
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] bg-white/20 border border-white/20 px-3 py-1.5 rounded-full backdrop-blur">
            {style.badge} · <span className="capitalize">{todayLabel}</span>
          </span>
          <p className="mt-3 text-sm font-semibold text-white/80">{greeting} — bienvenue sur O RESTO</p>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-1 capitalize">
            {style.title}, <span className="text-white/90">{user?.username}</span>
          </h1>
          {style.subtitle && <p className="text-sm text-white/85 mt-1 max-w-lg">{style.subtitle}</p>}
          {family === 'client' && user && (
            <>
              <ClientHeroStats
                kidsCount={myChildren(user.username).length}
                mealsLeft={subscriptions
                  .filter((s) => s.status === 'active' && new Date(s.endDate).getTime() >= Date.now() &&
                    (s.clientUsername === user.username || (s.childId && myChildren(user.username).some((k) => k.id === s.childId))))
                  .reduce((s, x) => s + x.mealsRemaining, 0)}
                onChildren={() => onNavigate('children')}
                onSub={() => onNavigate('subscription')}
              />
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-lg">
                {[
                  { label: 'Enfants', icon: Baby, go: () => onNavigate('children') },
                  { label: 'Abonnement', icon: Wallet, go: () => onNavigate('subscription') },
                  { label: 'QR Code', icon: QrCode, go: () => onNavigate('qrcode') },
                  { label: 'Menus', icon: CalendarDays, go: () => onNavigate('menus') },
                ].map((a) => (
                  <button
                    key={a.label}
                    onClick={a.go}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl bg-white/10 border border-white/15 backdrop-blur text-white font-bold text-xs hover:bg-white/20 active:scale-95 transition-all min-w-0"
                  >
                    <a.icon aria-hidden className="w-5 h-5 flex-shrink-0" /> <span className="truncate w-full text-center">{a.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {family === 'client' && (
        <>
          <div className="rounded-3xl overflow-hidden border-2 border-slate-100 shadow-sm">
            <div className="bg-gradient-to-r from-green-700 to-emerald-600 px-5 py-4 flex items-center justify-between">
              <p className="font-black text-white flex items-center gap-2">
                <Wallet className="w-5 h-5" /> Mon abonnement
              </p>
              <button onClick={() => onNavigate('subscription')} className="text-xs font-extrabold px-3.5 py-2 rounded-full bg-white text-green-700 hover:bg-green-50">
                Gérer →
              </button>
            </div>
            <div className="bg-white p-5">
              {(() => {
                const now = Date.now();
                const kids = user ? myChildren(user.username) : [];
                const actives = subscriptions.filter((s) =>
                  s.status === 'active' && new Date(s.endDate).getTime() >= now &&
                  (s.clientUsername === user?.username || (s.childId && kids.some((k) => k.id === s.childId))),
                );
                if (actives.length === 0) {
                  return (
                    <div className="text-center py-2">
                      <p className="text-sm text-slate-500">Aucun abonnement actif. Choisissez une formule pour vos enfants.</p>
                      <button onClick={() => onNavigate('subscription')} className="mt-3 px-5 py-2.5 rounded-xl bg-green-700 text-white text-sm font-bold hover:bg-green-800">
                        Choisir une formule
                      </button>
                    </div>
                  );
                }
                return (
                  <ul className="text-sm divide-y-2 divide-dashed divide-slate-200">
                    {actives.slice(0, 4).map((s) => {
                      const child = s.childId ? kids.find((k) => k.id === s.childId) : undefined;
                      const fname = formulas.find((f) => f.id === s.formulaId)?.name ?? 'Formule';
                      return (
                        <li key={s.id} className="flex justify-between items-center gap-2 py-3 first:pt-0 last:pb-0">
                          <span className="min-w-0">
                            <span className="block font-bold capitalize truncate">{child ? `${child.firstName} ${child.lastName}` : 'Parent'}</span>
                            <span className="text-xs text-slate-500">{fname} • expire le {new Date(s.endDate).toLocaleDateString('fr-FR')}</span>
                          </span>
                          <span className="font-black text-green-700 whitespace-nowrap bg-green-50 px-3 py-1.5 rounded-full text-xs flex-shrink-0">{s.mealsRemaining} repas</span>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-orange-100 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                <span className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center"><CalendarDays className="w-4 h-4 text-orange-600" /></span>
                Menu de la semaine
                {weeklyMenus.some((m) => (m.items ?? []).length > 0) && (
                  <span className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
                    {weeklyMenus.filter((m) => (m.items ?? []).length > 0).length}/5 jours publiés
                  </span>
                )}
              </div>
              {(() => {
                const published = weeklyMenus.filter((m) => (m.items ?? []).length > 0);
                if (published.length === 0) {
                  return (
                    <div className="mt-3 text-center py-5 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200">
                      <span className="w-12 h-12 rounded-2xl bg-white border border-slate-200 inline-flex items-center justify-center shadow-sm">
                        <CalendarDays className="w-6 h-6 text-slate-400" />
                      </span>
                      <p className="mt-2 font-bold text-slate-700 text-sm">Menus en préparation</p>
                      <p className="text-xs text-slate-500 mt-1">La cantine compose les menus de la semaine.<br />Revenez bientôt.</p>
                    </div>
                  );
                }
                return (
                  <ul className="mt-3 space-y-2">
                    {published.map((m) => (
                      <li key={m.day} className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-orange-50/70 border border-orange-100">
                        <span className="text-[11px] font-black px-2 py-1 rounded-lg bg-orange-500 text-white whitespace-nowrap flex-shrink-0">
                          {m.day.slice(0, 3).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-sm text-slate-800 truncate">{m.name || `Menu du ${m.day}`}</span>
                          <span className="block text-xs text-slate-500 truncate">{m.items.map((it) => it.name).join(' • ')}</span>
                        </span>
                        <span className="font-black text-sm text-orange-700 whitespace-nowrap flex-shrink-0">{formatCurrency(weeklyMenuTotal(m.items))}</span>
                      </li>
                    ))}
                  </ul>
                );
              })()}
              <button onClick={() => onNavigate('menus')} className="mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm hover:brightness-110 shadow-sm">
                Voir les menus
              </button>
            </div>

            <div className="bg-white rounded-3xl p-5 shadow-sm border border-green-100 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                <span className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center"><History className="w-4 h-4 text-green-700" /></span>
                Ma consommation
              </div>
              <p className="text-4xl font-black mt-2 tracking-tight">{myMeals} <span className="text-base font-bold text-slate-400">repas savourés</span></p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => onNavigate('qrcode')} className="py-2.5 rounded-xl bg-green-700 text-white font-bold text-sm hover:bg-green-800 flex items-center justify-center gap-1.5 shadow-sm">
                  <QrCode className="w-4 h-4" /> Mon QR
                </button>
                <button onClick={() => onNavigate('children')} className="py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200">
                  Suivi dépenses
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {family === 'personnel' && (
        <>
          {/* Tableau de bord service : état du jour en un coup d'œil */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div className="bg-white rounded-2xl p-4 md:p-5 shadow border">
              <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-500"><CheckCircle className="w-4 h-4 text-green-600" /> Servis</div>
              <p className="text-3xl md:text-4xl font-extrabold text-green-600 mt-1">{acceptedToday.length}</p>
              <p className="text-[11px] text-slate-400 font-medium">aujourd’hui</p>
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-5 shadow border">
              <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-500"><XCircle className="w-4 h-4 text-red-500" /> Refusés</div>
              <p className="text-3xl md:text-4xl font-extrabold text-red-500 mt-1">{rejectedToday.length}</p>
              <p className="text-[11px] text-slate-400 font-medium">aujourd’hui</p>
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-5 shadow border">
              <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-500"><Clock className="w-4 h-4 text-amber-500" /> En attente</div>
              <p className="text-3xl md:text-4xl font-extrabold text-amber-600 mt-1">{subscriptions.filter((s) => s.status === 'pending').length + payments.filter((p) => p.status === 'pending').length}</p>
              <p className="text-[11px] text-slate-400 font-medium">à encaisser</p>
            </div>
            <div className="bg-white rounded-2xl p-4 md:p-5 shadow border">
              <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-500"><CalendarDays className="w-4 h-4 text-orange-500" /> Menus</div>
              <p className="text-3xl md:text-4xl font-extrabold text-orange-600 mt-1">{published.length}<span className="text-lg text-slate-400">/5</span></p>
              <p className="text-[11px] text-slate-400 font-medium">jours publiés</p>
            </div>
          </div>

          {/* Semaine + activité */}
          <div className="grid md:grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                <span className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center"><CalendarDays className="w-4 h-4 text-orange-600" /></span>
                Semaine · {published.length}/5 publiée
              </div>
              <ul className="mt-3 space-y-2">
                {weeklyMenus.map((m) => {
                  const ok = (m.items ?? []).length > 0;
                  return (
                    <li key={m.day} className="flex items-center gap-2.5 text-sm">
                      <span className={`text-[11px] font-black px-2 py-1 rounded-lg whitespace-nowrap ${ok ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                        {m.day.slice(0, 3).toUpperCase()}
                      </span>
                      <span className={`min-w-0 flex-1 truncate ${ok ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>
                        {ok ? (m.name || `Menu du ${m.day}`) : 'Non composé'}
                      </span>
                      <span className={`text-[11px] font-bold ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>{ok ? 'Publié' : 'Brouillon'}</span>
                    </li>
                  );
                })}
              </ul>
              <button onClick={() => onNavigate('menu')} className="mt-4 w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-700">
                Gérer les menus
              </button>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border">
              <div className="flex items-center gap-2 text-sm font-black text-slate-800">
                <span className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center"><Ticket className="w-4 h-4 text-emerald-700" /></span>
                Activité du site
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex justify-between items-center rounded-xl bg-slate-50 border px-3 py-2.5"><span className="text-slate-600">Tickets publiés</span><span className="font-black">{formulas.filter((f) => f.kind === 'ticket' && !isOfficialFormula(f.id)).length}</span></li>
                <li className="flex justify-between items-center rounded-xl bg-slate-50 border px-3 py-2.5"><span className="text-slate-600">Abonnements actifs</span><span className="font-black">{subscriptions.filter((s) => s.status === 'active').length}</span></li>
                <li className="flex justify-between items-center rounded-xl bg-slate-50 border px-3 py-2.5"><span className="text-slate-600">Parents inscrits</span><span className="font-black">{parentProfiles.length}</span></li>
                <li className="flex justify-between items-center rounded-xl bg-slate-50 border px-3 py-2.5"><span className="text-slate-600">Plats récréation</span><span className="font-black">{products.filter((p) => p.available).length}</span></li>
              </ul>
              <button onClick={() => onNavigate('history')} className="mt-4 w-full py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 inline-flex items-center justify-center gap-2">
                <History className="w-4 h-4" /> Voir l’historique
              </button>
            </div>
          </div>
        </>
      )}

      {family === 'gestionnaire' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Repas servis (jour)" value={acceptedToday.length} />
            <StatCard label="Abonnements actifs" value={stats.activeClients} />
            <StatCard label="Menus publiés" value={`${weeklyMenus.filter((m) => (m.items ?? []).length > 0).length}/5`} />
            <StatCard label="Plats récréation" value={products.filter((p) => p.available).length} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <QuickLink title="Caisse (POS)" desc="Vente directe au comptant" icon={<Banknote className="w-6 h-6 text-white" />} gradient="from-slate-800 to-slate-900" onClick={() => onNavigate('pos')} />
            <QuickLink title="Tableau de bord" desc="Stats, graphiques et alertes" icon={<LayoutDashboard className="w-6 h-6 text-white" />} gradient="from-orange-500 to-red-600" onClick={() => onNavigate('dashboard')} />
            <QuickLink title="Historique" desc="Commandes et passages" icon={<History className="w-6 h-6 text-white" />} gradient="from-teal-500 to-emerald-600" onClick={() => onNavigate('history')} />
          </div>

          <MenuDuJourCard menu={menuDuJour} />
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
            <QuickLink title="Finance" desc="Ventes, abonnements, solde ISM" icon={<Banknote className="w-6 h-6 text-white" />} gradient="from-green-600 to-emerald-700" onClick={() => onNavigate('finance')} />
            <QuickLink title="Utilisateurs & accès" desc="Comptes, rôles et périmètres" icon={<Users className="w-6 h-6 text-white" />} gradient="from-slate-700 to-slate-900" onClick={() => onNavigate('users')} />
            <QuickLink title="Abonnés & paiements" desc="Encaissements Wave, espèces" icon={<Users className="w-6 h-6 text-white" />} gradient="from-emerald-600 to-teal-600" onClick={() => onNavigate('subscriptions')} />
          </div>
        </>
      )}
    </div>
  );

};

function ClientHeroStats({ kidsCount, mealsLeft, onChildren, onSub }: {
  kidsCount: number; mealsLeft: number; onChildren: () => void; onSub: () => void;
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 max-w-lg">
      <button onClick={onChildren} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white text-slate-900 shadow hover:bg-slate-100 active:scale-[0.98] transition-all text-left">
        <span className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
          <Baby className="w-5 h-5 text-green-700" />
        </span>
        <span>
          <span className="block text-xl font-black leading-none">{kidsCount}</span>
          <span className="block text-[11px] font-bold text-slate-500 mt-0.5">enfant(s) inscrit(s)</span>
        </span>
      </button>
      <button onClick={onSub} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/15 border border-white/25 text-white backdrop-blur hover:bg-white/25 active:scale-[0.98] transition-all text-left">
        <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <Wallet className="w-5 h-5 text-white" />
        </span>
        <span>
          <span className="block text-xl font-black leading-none">{mealsLeft}</span>
          <span className="block text-[11px] font-bold text-white/70 mt-0.5">repas restants</span>
        </span>
      </button>
    </div>
  );
}

function MenuDuJourCard({ menu, actionLabel, onAction }: { menu: { day: string; name: string; description?: string; items: { name: string; price: number }[] } | null; actionLabel?: string; onAction?: () => void }) {
  if (!menu || (menu.items ?? []).length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow border-2 border-dashed border-slate-200 p-8 text-center">
        <p className="font-black text-slate-800">Menus en préparation</p>
        <p className="mt-1 text-sm text-slate-500">Le Personnel compose la semaine — revenez bientôt. Service Lun → Ven.</p>
      </div>
    );
  }
  const total = weeklyMenuTotal(menu.items);
  return (
    <div className="bg-white rounded-2xl shadow border border-orange-100 overflow-hidden">
      <div className="p-5">
      <div className="flex items-center gap-2 font-bold text-slate-800">
        <CalendarDays className="w-5 h-5 text-orange-500" /> Menu — {menu.day} : {menu.name || `Menu du ${menu.day}`}
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {menu.items.map((it) => (
          <li key={it.name} className="flex justify-between"><span className="flex items-center gap-1.5"><UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" /> {it.name}</span><span className="font-semibold">{formatCurrency(it.price)}</span></li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between">
        <p className="font-extrabold text-lg">{formatCurrency(total)}</p>
        {actionLabel && onAction && (
          <button onClick={onAction} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600">
            {actionLabel}
          </button>
        )}
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
