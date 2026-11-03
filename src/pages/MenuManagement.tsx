import { useState } from 'react';
import { Product, ProductExtra } from '@/types/menu';
import { categories } from '@/data/mockData';
import { formatCurrency } from '@/lib/utils';
import { publishedDays, isWeekPublishable } from '@/lib/menus';
import { Plus, Edit2, Trash2, X, Check, CalendarDays, Eye } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useProducts } from '@/context/ProductContext';
import { useAuth } from '@/context/AuthContext';
import { useResto } from '@/context/RestoContext';
import { menuDateLabel, menuMonthDays } from '@/lib/menuDates';

const MenuManagement = () => {
  const { user } = useAuth();
  // Seul le Superviseur modifie ici (menus, tickets, plats) ; la Direction suit en lecture seule.
  const isDG = user?.role === 'admin';
  const { products, updateProduct, addProduct, deleteProduct: deleteProductFromContext } = useProducts();
  const { weeklyMenus, updateWeeklyMenu } = useResto();
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
  type DayDraft = { name: string; description: string; dessert: string };
  const monthDays = menuMonthDays(2026, 10, 2);
  const [monthDraft, setMonthDraft] = useState<Record<string, DayDraft> | null>(null);
  const [monthSaved, setMonthSaved] = useState(false);
  const baseMonth = (): Record<string, DayDraft> => {
    const byDay = Object.fromEntries(weeklyMenus.map((m) => [m.day, { name: m.name, description: m.description, dessert: m.dessert ?? '' }]));
    return Object.fromEntries(monthDays.map((day) => [day, byDay[day] ?? { name: '', description: '', dessert: '' }]));
  };
  const monthForm: Record<string, DayDraft> = monthDraft ?? baseMonth();
  const setDay = (day: string, patch: Partial<DayDraft>) => {
    const cur = monthDraft ?? baseMonth();
    setMonthDraft({ ...cur, [day]: { ...cur[day], ...patch } });
  };
  const monthRows = monthDays.map((day) => ({
    day,
    items: [],
    description: monthForm[day]?.description ?? '',
    dessert: monthForm[day]?.dessert ?? '',
  }));
  const composedCount = publishedDays(monthRows).length;
  const canPublish = isWeekPublishable(monthRows);
  const saveMonthMenus = () => {
    if (!canPublish) return;
    monthDays.forEach((day) => {
      const row = monthForm[day];
      if (!row) return;
      const existing = weeklyMenus.find((m) => m.day === day);
      updateWeeklyMenu(day, '', row.description.trim(), [], existing?.price ?? 0, row.dessert.trim());
    });
    setMonthDraft(null);
    setMonthSaved(true);
    window.setTimeout(() => setMonthSaved(false), 2500);
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Gestion du menu</h1>
        </div>
        {!isDG ? (
          <button onClick={openAdd} className="flex items-center gap-2 bg-gradient-to-r from-slate-500 to-red-600 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-slate-500/50 transition-all hover:scale-105">
            <Plus className="w-5 h-5" />
            Ajouter un produit
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-2.5 rounded-xl">
            <Eye className="w-4 h-4" /> Suivi — composition par le Superviseur
          </span>
        )}
      </div>

      {/* Menu mensuel : composition Superviseur */}
      <div className="bg-white rounded-2xl border p-5">
        <p className="font-bold text-slate-800 flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-slate-500" /> Menu mensuel — novembre 2026
        </p>
        <p className="text-xs text-slate-500 mt-1">Renseignez uniquement le repas et le dessert pour chaque jour du 2 au 30 novembre. Le menu mensuel est visible par les parents et l’Espace Repas dès sa publication.</p>
        {isDG && (
          <p className="mt-2 text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-1.5">
            <Eye className="w-4 h-4 flex-shrink-0" /> Suivi Direction : composition modifiable uniquement par le Superviseur.
          </p>
        )}
        <fieldset disabled={isDG} className="contents">
        <div className="mt-3 grid lg:grid-cols-2 gap-3">
          {monthDays.map((day) => {
            const row = monthForm[day] ?? { name: '', description: '', dessert: '' };
            return (
              <div key={day} className="rounded-2xl border-2 border-slate-100 p-4 hover:border-slate-200 transition-colors">
                <span className="text-[11px] font-black px-2.5 py-1.5 rounded-xl bg-gradient-to-br from-slate-500 to-red-600 text-white whitespace-nowrap inline-block">
                  {menuDateLabel(day)}
                </span>
                <div className="mt-2">
                  <label htmlFor={`meal-${day}`} className="text-[11px] font-black uppercase tracking-widest text-slate-600">Repas</label>
                  <input
                    id={`meal-${day}`}
                    value={row.description}
                    onChange={(e) => setDay(day, { description: e.target.value })}
                    placeholder="ex : Riz au poisson + légumes"
                    maxLength={140}
                    className="mt-1 w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-slate-500"
                  />
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                  <label htmlFor={`dessert-${day}`} className="text-[11px] font-black uppercase tracking-widest text-amber-700 whitespace-nowrap">Dessert</label>
                  <input
                    id={`dessert-${day}`}
                    value={row.dessert}
                    onChange={(e) => setDay(day, { dessert: e.target.value })}
                    placeholder="ex : Fruit de saison"
                    maxLength={60}
                    className="ml-auto flex-1 min-w-0 px-3 py-1.5 rounded-xl border-2 border-amber-200 text-sm outline-none focus:border-amber-500 bg-white"
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={saveMonthMenus}
            disabled={!canPublish}
            title={canPublish ? 'Publier le mois (Accès Abonné + Espace Repas)' : 'Renseignez au moins un jour pour publier'}
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            Publier les menus (parents + Espace Repas)
          </button>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${canPublish ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {composedCount}/29 jours composés{canPublish ? ' — publication possible' : ' — renseignez au moins un jour'}
          </span>
          {monthSaved && <span className="text-xs font-bold text-green-700">Menu mensuel publié ✓ (visibles parents + Espace Repas)</span>}
        </div>
        </fieldset>
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeCategory === cat
                ? 'bg-gradient-to-r from-slate-500 to-red-600 text-white shadow-lg shadow-slate-500/30'
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
                  <span className="text-lg font-bold bg-gradient-to-r from-slate-600 to-red-600 bg-clip-text text-transparent whitespace-nowrap">
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
        <div className="sticky top-0 p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-red-50 flex items-center justify-between">
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
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-slate-500/30 focus:border-slate-500 outline-none transition-all"
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
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-slate-500/30 focus:border-slate-500 outline-none bg-white"
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
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-slate-500/30 focus:border-slate-500 outline-none"
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
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-slate-500/30 focus:border-slate-500 outline-none resize-none"
              rows={3}
              placeholder="Décrivez le produit..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">URL de l'image</label>
            <input
              value={form.image || ''}
              onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-slate-500/30 focus:border-slate-500 outline-none"
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
                    <span className="text-sm font-bold text-slate-600">+{formatCurrency(extra.price)}</span>
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
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-800 text-sm outline-none focus:border-slate-500" 
              />
              <input 
                type="number" 
                step="1" 
                placeholder="Prix" 
                value={newExtra.price || ''} 
                onChange={(e) => setNewExtra((n) => ({ ...n, price: parseFloat(e.target.value) || 0 }))} 
                className="w-28 px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-800 text-sm outline-none focus:border-slate-500" 
              />
              <button type="button" onClick={addExtra} className="p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-3.5 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors">
              Annuler
            </button>
            <button type="submit" className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-slate-500 to-red-600 text-white font-semibold text-sm hover:shadow-lg hover:shadow-slate-500/50 transition-all flex items-center justify-center gap-2">
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
