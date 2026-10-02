import { useState } from 'react';
import { Product, ProductExtra, WEEK_DAYS, WeeklyMenuItem } from '@/types/menu';
import { categories } from '@/data/mockData';
import { formatCurrency } from '@/lib/utils';
import { weeklyMenuTotal, sanitizeMenuItem, MAX_ITEMS_PER_DAY, isWeekComplete } from '@/lib/menus';
import { validateFormulaPayload, pricePerMeal, isOfficialFormula } from '@/lib/formulas';
import { Plus, Edit2, Trash2, X, Check, CalendarDays, UtensilsCrossed, Ticket, Pencil, Eye } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useProducts } from '@/context/ProductContext';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';

const MenuManagement = () => {
  const { user } = useAuth();
  // Seul le Personnel modifie ici (menus, tickets, plats) ; la Direction suit en lecture seule.
  const isDG = user?.role === 'admin' || user?.role === 'manager';
  const { products, updateProduct, addProduct, deleteProduct: deleteProductFromContext } = useProducts();
  const {
    weeklyMenus, updateWeeklyMenu, formulas, subscriptions,
    addFormula, updateFormula, deleteFormula,
  } = useResto();
  const [activeCategory, setActiveCategory] = useState('Tous');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);

  const filtered = activeCategory === 'Tous' ? products : products.filter((p) => p.category === activeCategory);

  const toggleAvailability = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (product) {
      updateProduct(id, { available: !product.available });
    }
  };

  const handleDeleteProduct = (id: string) => {
    setProductToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (productToDelete) {
      deleteProductFromContext(productToDelete);
      setProductToDelete(null);
    }
    setShowDeleteConfirm(false);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setShowModal(true);
  };

  const openAdd = () => {
    setEditingProduct(null);
    setShowModal(true);
  };

  type DayDraft = { name: string; description: string; items: WeeklyMenuItem[] };
  const [weekDraft, setWeekDraft] = useState<Record<string, DayDraft> | null>(null);
  const [weekSaved, setWeekSaved] = useState(false);
  const [pickProduct, setPickProduct] = useState<Record<string, string>>({});
  const [customDish, setCustomDish] = useState<Record<string, { name: string; price: string }>>({});
  const baseWeek = (): Record<string, DayDraft> =>
    Object.fromEntries(weeklyMenus.map((m) => [m.day, { name: m.name, description: m.description, items: (m.items ?? []).map((it) => ({ ...it })) }]));
  const weekForm: Record<string, DayDraft> = weekDraft ?? baseWeek();
  const setDay = (day: string, patch: Partial<DayDraft>) => {
    const cur = weekDraft ?? baseWeek();
    setWeekDraft({ ...cur, [day]: { ...cur[day], ...patch } });
  };
  const addDish = (day: string, item: WeeklyMenuItem | null) => {
    if (!item) return;
    const cur = weekForm[day];
    if (!cur || cur.items.length >= MAX_ITEMS_PER_DAY) return;
    setDay(day, { items: [...cur.items, item] });
  };
  const removeDish = (day: string, idx: number) => {
    const cur = weekForm[day];
    if (!cur) return;
    setDay(day, { items: cur.items.filter((_, i) => i !== idx) });
  };
  const composedCount = WEEK_DAYS.filter((d) => (weekForm[d]?.items ?? []).length > 0).length;
  const weekComplete = isWeekComplete(WEEK_DAYS.map((d) => ({ day: d, items: weekForm[d]?.items ?? [] })));
  const saveWeekMenus = () => {
    if (!weekComplete) return;
    WEEK_DAYS.forEach((d) => {
      const row = weekForm[d];
      if (row) updateWeeklyMenu(d, row.name.trim(), row.description.trim(), row.items);
    });
    setWeekDraft(null);
    setWeekSaved(true);
    window.setTimeout(() => setWeekSaved(false), 2500);
  };

  {/* ---- Tickets repas : créés ici par DG + personnel (tous les champs + prix) ---- */}
  const [ticketForm, setTicketForm] = useState({
    name: '', description: '', price: '', oldPrice: '', durationDays: '', mealsIncluded: '', rules: '',
  });
  const [editingTicket, setEditingTicket] = useState<string | null>(null);
  const [confirmTicketDelete, setConfirmTicketDelete] = useState<string | null>(null);
  const [ticketMsg, setTicketMsg] = useState('');
  const ticketFormulas = formulas.filter((f) => f.kind === 'ticket');
  const ticketPreviewPrice = Number(ticketForm.price) || 0;
  const ticketPreviewMeals = Number(ticketForm.mealsIncluded) || 0;

  const startTicketEdit = (id: string) => {
    const f = formulas.find((x) => x.id === id);
    if (!f || isOfficialFormula(f.id)) return;
    setEditingTicket(f.id);
    setConfirmTicketDelete(null);
    setTicketMsg('');
    setTicketForm({
      name: f.name, description: f.description,
      price: String(f.price), oldPrice: f.oldPrice ? String(f.oldPrice) : '',
      durationDays: String(f.durationDays), mealsIncluded: String(f.mealsIncluded),
      rules: f.rules ?? '',
    });
  };

  const resetTicketForm = () => {
    setEditingTicket(null);
    setConfirmTicketDelete(null);
    setTicketForm({ name: '', description: '', price: '', oldPrice: '', durationDays: '', mealsIncluded: '', rules: '' });
  };

  const handleSaveTicket = (e: React.FormEvent) => {
    e.preventDefault();
    const rawOld = ticketForm.oldPrice.trim() === '' ? undefined : Number(ticketForm.oldPrice);
    const payload = {
      name: ticketForm.name.trim(), description: ticketForm.description.trim(),
      price: Number(ticketForm.price) || 0, oldPrice: rawOld,
      durationDays: Math.floor(Number(ticketForm.durationDays)) || 0,
      mealsIncluded: Math.floor(Number(ticketForm.mealsIncluded)) || 0,
      rules: ticketForm.rules.trim(), kind: 'ticket' as const,
    };
    const check = validateFormulaPayload(payload);
    if (!check.ok) {
      setTicketMsg(check.message);
      return;
    }
    if (editingTicket) {
      if (isOfficialFormula(editingTicket)) {
        setTicketMsg('Ticket officiel du flyer : non modifiable.');
        return;
      }
      updateFormula(editingTicket, payload);
      setTicketMsg(`Ticket « ${payload.name} » mis à jour.`);
    } else {
      addFormula(payload);
      setTicketMsg(`Ticket « ${payload.name} » créé (tous cycles, vente au comptoir).`);
    }
    resetTicketForm();
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Gestion du menu</h1>
          <p className="text-sm text-slate-600 mt-1">{products.length} produits · {products.filter(p => p.available).length} disponibles</p>
        </div>
        {!isDG ? (
          <button onClick={openAdd} className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-600 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-orange-500/50 transition-all hover:scale-105">
            <Plus className="w-5 h-5" />
            Ajouter un produit
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-2.5 rounded-xl">
            <Eye className="w-4 h-4" /> Suivi — composition par le Personnel
          </span>
        )}
      </div>

      {/* Menus du jour : composition Personnel, chaque menu avec son prix + cumul */}
      <div className="bg-white rounded-2xl border p-5">
        <p className="font-bold text-slate-800 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-orange-500" /> Menus du jour — composition
        </p>
        <p className="text-xs text-slate-500 mt-1">Composez chaque menu du jour plat par plat avec les prix : le cumul se calcule seul. La semaine s’affiche aux parents une fois les 5 jours composés et publiés.</p>
        {(() => {
          const dayTotals = WEEK_DAYS.map((d) => weeklyMenuTotal(weekForm[d]?.items ?? []));
          const weekTotal = dayTotals.reduce((s, t) => s + t, 0);
          const done = dayTotals.filter((t) => t > 0).length;
          return (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 p-3 text-white">
                <p className="text-lg font-black leading-none">{formatCurrency(weekTotal)}</p>
                <p className="text-[11px] font-bold opacity-90 mt-1">cumul semaine</p>
              </div>
              <div className="rounded-2xl bg-slate-900 p-3 text-white">
                <p className="text-lg font-black leading-none">{formatCurrency(Math.round(weekTotal / 5))}</p>
                <p className="text-[11px] font-bold opacity-70 mt-1">moyenne / jour</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-lg font-black leading-none text-slate-800">{done}/5</p>
                <div className="h-1.5 rounded-full bg-slate-200 mt-2 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all" style={{ width: `${(done / 5) * 100}%` }} />
                </div>
                <p className="text-[11px] font-bold text-slate-500 mt-1">jours composés</p>
              </div>
            </div>
          );
        })()}
        {isDG && (
          <p className="mt-2 text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-1.5">
            <Eye className="w-4 h-4 flex-shrink-0" /> Suivi Direction : composition modifiable uniquement par le Personnel.
          </p>
        )}
        <fieldset disabled={isDG} className="contents">
        <div className="mt-3 grid lg:grid-cols-2 gap-3">
          {WEEK_DAYS.map((d) => {
            const row = weekForm[d] ?? { name: '', description: '', items: [] };
            const total = weeklyMenuTotal(row.items);
            const picked = pickProduct[d] ?? '';
            const custom = customDish[d] ?? { name: '', price: '' };
            return (
              <div key={d} className="rounded-2xl border-2 border-slate-100 p-4 hover:border-orange-200 transition-colors">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-black px-2.5 py-1.5 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white whitespace-nowrap flex-shrink-0">{d}</span>
                  <input
                    value={row.name}
                    onChange={(e) => setDay(d, { name: e.target.value })}
                    placeholder="Nom du menu"
                    maxLength={60}
                    className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500"
                  />
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap flex-shrink-0">{row.items.length} plat(s)</span>
                </div>
                <div className="mt-2 flex items-center justify-between rounded-xl bg-orange-50 border border-orange-100 px-3 py-2">
                  <span className="text-[11px] font-black uppercase tracking-widest text-orange-700">Total menu</span>
                  <span className="text-lg font-black text-slate-900">{formatCurrency(total)}</span>
                </div>
                <input
                  value={row.description}
                  onChange={(e) => setDay(d, { description: e.target.value })}
                  placeholder="Accroche (ex : Tacos + Jus Naturel)"
                  maxLength={140}
                  className="mt-2 w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500"
                />
                {row.items.length > 0 && (
                  <ul className="mt-2 divide-y divide-slate-100 border rounded-xl overflow-hidden">
                    {row.items.map((it, i) => (
                      <li key={`${it.name}-${i}`} className="px-3 py-1.5 flex items-center gap-2 text-sm">
                        <span className="w-5 h-5 rounded-lg bg-orange-100 text-orange-700 text-[11px] font-black flex items-center justify-center flex-shrink-0">{i + 1}</span>
                        <span className="font-semibold flex-1 truncate">{it.name}</span>
                        <span className="font-bold text-slate-700 whitespace-nowrap">{formatCurrency(it.price)}</span>
                        <button
                          type="button"
                          onClick={() => removeDish(d, i)}
                          title="Retirer ce plat"
                          className="p-1 rounded-lg text-red-500 hover:bg-red-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {row.items.length > 0 && (
                  <div className="mt-2 pt-2 border-t-2 border-dashed border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Cumul — {row.items.length} plat(s)</span>
                    <span className="font-black text-slate-900">{formatCurrency(total)}</span>
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <select
                    value={picked}
                    onChange={(e) => setPickProduct((p) => ({ ...p, [d]: e.target.value }))}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-orange-500"
                  >
                    <option value="">+ Plat du catalogue…</option>
                    {products.filter((p) => p.available).map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const prod = products.find((p) => p.id === picked);
                      if (prod) {
                        addDish(d, sanitizeMenuItem(prod.name, prod.price));
                        setPickProduct((p) => ({ ...p, [d]: '' }));
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700"
                  >
                    Ajouter
                  </button>
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={custom.name}
                    onChange={(e) => setCustomDish((p) => ({ ...p, [d]: { name: e.target.value, price: custom.price } }))}
                    placeholder="Plat libre (ex : Thiéboudienne)"
                    maxLength={60}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500"
                  />
                  <input
                    type="number" min={0} max={100000}
                    value={custom.price}
                    onChange={(e) => setCustomDish((p) => ({ ...p, [d]: { name: custom.name, price: e.target.value } }))}
                    placeholder="Prix"
                    className="w-24 px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const item = sanitizeMenuItem(custom.name, Number(custom.price));
                      if (item) {
                        addDish(d, item);
                        setCustomDish((p) => ({ ...p, [d]: { name: '', price: '' } }));
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-orange-100 text-orange-700 text-sm font-bold hover:bg-orange-200"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={saveWeekMenus}
            disabled={!weekComplete}
            title={weekComplete ? 'Publier la semaine (visible page Menus)' : 'Composez les 5 jours pour publier'}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            Publier les menus de la semaine
          </button>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${weekComplete ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {composedCount}/5 jours composés{weekComplete ? '' : ' — complétez tous les jours pour publier'}
          </span>
          {weekSaved && <span className="text-xs font-bold text-green-700">Menus publiés ✓ (visibles page Menus)</span>}
        </div>
        </fieldset>
      </div>

      {/* Tickets repas — créés ici par DG + personnel, vendus au comptoir */}
      <div className="bg-white rounded-2xl border p-5">
        <p className="font-bold text-slate-800 flex items-center gap-2">
          <Ticket className="w-5 h-5 text-orange-500" /> Tickets repas
        </p>
        <p className="text-xs text-slate-500 mt-1">Dépannage au comptoir : tous les champs + prix. Vendus sur la page Tickets et à la caisse.</p>
        {isDG && (
          <p className="mt-2 text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-1.5">
            <Eye className="w-4 h-4 flex-shrink-0" /> Suivi Direction : tickets modifiables uniquement par le Personnel.
          </p>
        )}
        {ticketMsg && (
          <p className="mt-2 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">{ticketMsg}</p>
        )}
        {!isDG && (
        <form onSubmit={handleSaveTicket} className="mt-3 grid md:grid-cols-3 gap-3">
          <p className="md:col-span-3 font-bold text-slate-800 text-sm flex items-center gap-2">
            {editingTicket ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {editingTicket ? 'Modifier le ticket' : 'Nouveau ticket repas'}
          </p>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Nom du ticket *</span>
            <input value={ticketForm.name} onChange={(e) => setTicketForm({ ...ticketForm, name: e.target.value })} placeholder="ex : Ticket — 1 repas" maxLength={80} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Description</span>
            <input value={ticketForm.description} onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })} placeholder="ex : 1 repas à consommer librement" maxLength={140} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Prix (FCFA) *</span>
            <input type="number" min={100} step={100} value={ticketForm.price} onChange={(e) => setTicketForm({ ...ticketForm, price: e.target.value })} placeholder="ex : 1900" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" required />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Prix barré (optionnel)</span>
            <input type="number" min={0} step={100} value={ticketForm.oldPrice} onChange={(e) => setTicketForm({ ...ticketForm, oldPrice: e.target.value })} placeholder="vide = pas d’offre" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">Validité (jours) *</span>
              <input type="number" min={1} max={365} value={ticketForm.durationDays} onChange={(e) => setTicketForm({ ...ticketForm, durationDays: e.target.value })} placeholder="ex : 7" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" required />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">Repas inclus *</span>
              <input type="number" min={1} max={365} value={ticketForm.mealsIncluded} onChange={(e) => setTicketForm({ ...ticketForm, mealsIncluded: e.target.value })} placeholder="ex : 1" className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" required />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Règles</span>
            <input value={ticketForm.rules} onChange={(e) => setTicketForm({ ...ticketForm, rules: e.target.value })} placeholder="ex : valable 7 jours, 1 repas" maxLength={140} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-orange-500" />
          </label>
          <div className="md:col-span-3 flex flex-wrap items-center gap-3">
            <div className="flex gap-2 flex-1 min-w-[200px]">
              <button type="submit" className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-700">{editingTicket ? 'Enregistrer' : 'Créer le ticket'}</button>
              {editingTicket && <button type="button" onClick={resetTicketForm} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm">Annuler</button>}
            </div>
            {ticketPreviewPrice > 0 && ticketPreviewMeals > 0 && (
              <span className="text-xs font-extrabold text-slate-800">≈ {formatCurrency(pricePerMeal(ticketPreviewPrice, ticketPreviewMeals))} / repas · {ticketPreviewMeals} repas · {Number(ticketForm.durationDays) || '?'} j</span>
            )}
          </div>
        </form>
        )}

        <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ticketFormulas.filter((f) => !isOfficialFormula(f.id)).length === 0 && (
            <p className="md:col-span-2 lg:col-span-3 text-sm text-slate-400 text-center py-4">Aucun ticket : créez le premier ci-dessus.</p>
          )}
          {ticketFormulas.filter((f) => !isOfficialFormula(f.id)).map((f) => {
            const inUse = subscriptions.filter((s) => s.formulaId === f.id && (s.status === 'active' || s.status === 'pending')).length;
            return (
              <div key={f.id} className="rounded-2xl border-2 border-slate-100 p-4">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Tous cycles</span>
                  {inUse > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{inUse} en cours</span>
                  )}
                </div>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">{f.name}</p>
                  <p className="font-extrabold text-right whitespace-nowrap">{formatCurrency(f.price)}
                    {f.oldPrice && f.oldPrice > f.price && (
                      <span className="ml-2 text-sm font-normal text-slate-400 line-through">{formatCurrency(f.oldPrice)}</span>
                    )}
                  </p>
                </div>
                {!isDG && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => startTicketEdit(f.id)} className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200">Modifier</button>
                    <button
                      onClick={() => {
                        if (confirmTicketDelete !== f.id) { setConfirmTicketDelete(f.id); return; }
                        setConfirmTicketDelete(null);
                        if (inUse > 0) {
                          setTicketMsg(`Suppression refusée : ${inUse} vente(s) utilisent encore « ${f.name} ».`);
                          return;
                        }
                        deleteFormula(f.id);
                        if (editingTicket === f.id) resetTicketForm();
                        setTicketMsg(`Ticket « ${f.name} » supprimé.`);
                      }}
                      title="Supprimer le ticket"
                      className={`p-2 rounded-xl ${confirmTicketDelete === f.id ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {confirmTicketDelete === f.id && !isDG && (
                  <p className="mt-2 text-[11px] font-bold text-red-600">Confirmer ? Cliquez à nouveau sur la corbeille.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeCategory === cat
                ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/30'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
        {filtered.map((product) => (
          <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group">
            <div className="relative h-48 lg:h-52 overflow-hidden">
              <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
              <span className={`absolute top-3 right-3 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg ${
                product.available 
                  ? 'bg-green-500 text-white' 
                  : 'bg-slate-900 text-white'
              }`}>
                {product.available ? (
                  <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Disponible</span>
                ) : (
                  'Indisponible'
                )}
              </span>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-slate-800 text-lg">{product.name}</h3>
                  <span className="text-lg font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent whitespace-nowrap">
                    {formatCurrency(product.price)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">{product.category}</p>
              </div>
              {product.description && (
                <p className="text-sm text-slate-600 line-clamp-2">{product.description}</p>
              )}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                {isDG ? (
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${product.available ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {product.available ? 'Disponible' : 'Indisponible'}
                  </span>
                ) : (
                  <>
                    <label className="flex items-center gap-2.5 cursor-pointer group/toggle">
                      <div
                        onClick={() => toggleAvailability(product.id)}
                        className={`w-11 h-6 rounded-full transition-all relative cursor-pointer ${
                          product.available ? 'bg-green-500' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                          product.available ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </div>
                      <span className="text-xs font-medium text-slate-600">Disponible</span>
                    </label>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(product)} className="p-2.5 rounded-lg hover:bg-emerald-50 transition-colors text-slate-600 hover:text-emerald-600 group/edit">
                        <Edit2 className="w-4.5 h-4.5" />
                      </button>
                      <button onClick={() => handleDeleteProduct(product.id)} className="p-2.5 rounded-lg hover:bg-red-50 transition-colors text-slate-600 hover:text-red-600 group/delete">
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && <ProductModal product={editingProduct} onClose={() => setShowModal(false)} onSave={(p) => {
        if (editingProduct) {
          updateProduct(p.id, p);
        } else {
          addProduct({ ...p, id: Date.now().toString() });
        }
        setShowModal(false);
      }} />}

      {/* Confirmation de suppression */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Supprimer le produit ?"
        message="Êtes-vous sûr de vouloir supprimer ce produit ? Cette action est irréversible."
        confirmText="Supprimer"
        cancelText="Annuler"
        type="danger"
        onConfirm={confirmDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

/* Product Modal */
interface ModalProps {
  product: Product | null;
  onClose: () => void;
  onSave: (product: Product) => void;
}

const ProductModal = ({ product, onClose, onSave }: ModalProps) => {
  const [form, setForm] = useState<Partial<Product>>(
    product || { name: '', category: 'Burgers', price: 0, description: '', available: true, extras: [] }
  );

  const [newExtra, setNewExtra] = useState({ name: '', price: 0 });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form as Product);
  };

  const addExtra = () => {
    if (newExtra.name) {
      setForm((f) => ({ ...f, extras: [...(f.extras || []), { id: Date.now().toString(), ...newExtra }] }));
      setNewExtra({ name: '', price: 0 });
    }
  };

  const removeExtra = (id: string) => {
    setForm((f) => ({ ...f, extras: (f.extras || []).filter((e) => e.id !== id) }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 p-6 border-b border-slate-200 bg-gradient-to-r from-orange-50 to-red-50 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800">
            {product ? 'Modifier le produit' : 'Nouveau produit'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Nom du produit</label>
            <input
              value={form.name || ''}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none transition-all"
              placeholder="Ex: Classic Burger"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Catégorie</label>
              <select
                value={form.category || 'Burgers'}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none bg-white"
              >
                {categories.filter((c) => c !== 'Tous').map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Prix (FCFA)</label>
              <input
                type="number"
                step="1"
                value={form.price || ''}
                onChange={(e) => setForm((f) => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none"
                placeholder="5000"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
            <textarea
              value={form.description || ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none resize-none"
              rows={3}
              placeholder="Décrivez le produit..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">URL de l'image</label>
            <input
              value={form.image || ''}
              onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none"
              placeholder="https://..."
            />
          </div>
          {/* Extras */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">Extras (optionnels)</label>
            {(form.extras || []).length > 0 && (
              <div className="space-y-2 mb-3">
                {(form.extras || []).map((extra) => (
                  <div key={extra.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="flex-1 text-sm font-medium text-slate-800">{extra.name}</span>
                    <span className="text-sm font-bold text-orange-600">+{formatCurrency(extra.price)}</span>
                    <button type="button" onClick={() => removeExtra(extra.id)} className="p-1.5 hover:bg-red-100 rounded-lg text-slate-400 hover:text-red-600 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input 
                placeholder="Nom de l'extra" 
                value={newExtra.name} 
                onChange={(e) => setNewExtra((n) => ({ ...n, name: e.target.value }))} 
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-800 text-sm outline-none focus:border-orange-500" 
              />
              <input 
                type="number" 
                step="1" 
                placeholder="Prix" 
                value={newExtra.price || ''} 
                onChange={(e) => setNewExtra((n) => ({ ...n, price: parseFloat(e.target.value) || 0 }))} 
                className="w-28 px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-800 text-sm outline-none focus:border-orange-500" 
              />
              <button type="button" onClick={addExtra} className="p-2.5 rounded-xl bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors">
              Annuler
            </button>
            <button type="submit" className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-orange-500/50 transition-all flex items-center justify-center gap-2">
              <Check className="w-5 h-5" />
              {product ? 'Enregistrer' : 'Ajouter le produit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MenuManagement;
