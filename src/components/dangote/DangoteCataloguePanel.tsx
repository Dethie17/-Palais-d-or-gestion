import { useState } from 'react';
import { Loader2, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { dangoteApi, formatMoney } from '@/lib/dangote';
import type { DangoteCategorie, DangotePlat } from '@/types/dangote';
import {
  dangerButtonClass,
  EmptyState,
  Field,
  inputClass,
  Panel,
  primaryButtonClass,
  secondaryButtonClass,
  StatusBadge,
} from './DangoteUI';

interface Props {
  entiteId: string;
  categories: DangoteCategorie[];
  plats: DangotePlat[];
  onChanged: () => void;
}

interface PlatForm {
  id: string;
  nom: string;
  categorieId: string;
  prix: string;
  cout: string;
  description: string;
  estPremium: boolean;
  disponible: boolean;
  stockQuantite: string;
  stockAlerte: string;
  imageUrl: string;
}

const emptyPlat: PlatForm = {
  id: '',
  nom: '',
  categorieId: '',
  prix: '',
  cout: '',
  description: '',
  estPremium: false,
  disponible: true,
  stockQuantite: '',
  stockAlerte: '',
  imageUrl: '',
};

export default function DangoteCataloguePanel({ entiteId, categories, plats, onChanged }: Props) {
  const [categoryName, setCategoryName] = useState('');
  const [categoryOrder, setCategoryOrder] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [platOpen, setPlatOpen] = useState(false);
  const [platForm, setPlatForm] = useState<PlatForm>(emptyPlat);
  const [savingPlat, setSavingPlat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    setAddingCategory(true);
    try {
      await dangoteApi('categorie.save', {
        entiteId,
        nom: categoryName,
        ordre: categoryOrder ? Number(categoryOrder) : categories.length * 10 + 10,
      });
      setCategoryName('');
      setCategoryOrder('');
      toast.success('Catégorie ajoutée.');
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAddingCategory(false);
    }
  };

  const openCreate = () => {
    setPlatForm({ ...emptyPlat, categorieId: categories[0]?.id ?? '' });
    setError(null);
    setPlatOpen(true);
  };

  const openEdit = (plat: DangotePlat) => {
    setPlatForm({
      id: plat.id,
      nom: plat.nom,
      categorieId: plat.categorie_id ?? '',
      prix: String(plat.prix),
      cout: plat.cout != null ? String(plat.cout) : '',
      description: plat.description ?? '',
      estPremium: plat.est_premium,
      disponible: plat.disponible,
      stockQuantite: plat.stock_quantite != null ? String(plat.stock_quantite) : '',
      stockAlerte: plat.stock_alerte != null ? String(plat.stock_alerte) : '',
      imageUrl: plat.image_url ?? '',
    });
    setError(null);
    setPlatOpen(true);
  };

  const savePlat = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSavingPlat(true);
    try {
      await dangoteApi('plat.save', {
        entiteId,
        id: platForm.id || undefined,
        nom: platForm.nom,
        categorieId: platForm.categorieId,
        prix: Number(platForm.prix),
        cout: platForm.cout,
        description: platForm.description,
        estPremium: platForm.estPremium,
        disponible: platForm.disponible,
        stockQuantite: platForm.stockQuantite,
        stockAlerte: platForm.stockAlerte,
        imageUrl: platForm.imageUrl,
      });
      toast.success('Plat enregistré.');
      setPlatOpen(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPlat(false);
    }
  };

  const removePlat = async (plat: DangotePlat) => {
    if (!window.confirm(`Supprimer « ${plat.nom} » du catalogue ?`)) return;
    try {
      await dangoteApi('plat.delete', { entiteId, id: plat.id });
      toast.success('Plat supprimé.');
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const set = <K extends keyof PlatForm>(key: K, value: PlatForm[K]) => {
    setPlatForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Panel title="Catégories" description="Organisez le catalogue par famille de plats.">
        <form onSubmit={addCategory} className="space-y-2">
          <input
            className={inputClass}
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Nom de la catégorie"
            required
          />
          <div className="flex gap-2">
            <input
              type="number"
              className={inputClass}
              value={categoryOrder}
              onChange={(e) => setCategoryOrder(e.target.value)}
              placeholder="Ordre"
            />
            <button className={primaryButtonClass} disabled={addingCategory}>
              {addingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Ajouter
            </button>
          </div>
        </form>
        <div className="mt-4 space-y-2">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune catégorie.</p>
          ) : (
            categories.map((category) => {
              const count = plats.filter((plat) => plat.categorie_id === category.id).length;
              return (
                <div key={category.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{category.nom}</p>
                    <p className="text-xs text-slate-500">{count} plat{count > 1 ? 's' : ''}</p>
                  </div>
                  <StatusBadge tone={category.actif ? 'green' : 'slate'}>{category.actif ? 'Active' : 'Inactive'}</StatusBadge>
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <Panel
        title="Catalogue des plats"
        description="Chaque plat porte son prix de référence. Le menu du jour peut le reprendre."
        actions={
          <button className={primaryButtonClass} onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nouveau plat
          </button>
        }
      >
        {plats.length === 0 ? (
          <EmptyState title="Aucun plat au catalogue" description="Ajoutez vos plats pour composer les menus du jour." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Plat</th>
                  <th className="px-3 py-2">Catégorie</th>
                  <th className="px-3 py-2">Prix</th>
                  <th className="px-3 py-2">Stock</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plats.map((plat) => {
                  const category = categories.find((item) => item.id === plat.categorie_id);
                  return (
                    <tr key={plat.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <p className="font-bold text-slate-800">{plat.nom}</p>
                        {plat.description ? <p className="max-w-xs truncate text-xs text-slate-500">{plat.description}</p> : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{category?.nom ?? '—'}</td>
                      <td className="px-3 py-2 font-bold text-slate-800">{formatMoney(plat.prix)}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {plat.stock_quantite != null ? plat.stock_quantite : '—'}
                        {plat.stock_alerte != null && plat.stock_quantite != null && plat.stock_quantite <= plat.stock_alerte ? (
                          <span className="ml-2 text-[11px] font-bold text-amber-700">Alerte</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge tone={plat.disponible ? 'green' : 'red'}>{plat.disponible ? 'Disponible' : 'Indisponible'}</StatusBadge>
                          {plat.est_premium ? <StatusBadge tone="amber">Premium</StatusBadge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button className={secondaryButtonClass} onClick={() => openEdit(plat)} title="Modifier">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button className={dangerButtonClass} onClick={() => void removePlat(plat)} title="Supprimer">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={platOpen} onOpenChange={setPlatOpen}>
        <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{platForm.id ? 'Modifier le plat' : 'Nouveau plat'}</DialogTitle>
            <DialogDescription>Le prix est un prix de référence : le menu du jour peut le remplacer.</DialogDescription>
          </DialogHeader>
          <form onSubmit={savePlat} className="space-y-3">
            {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nom du plat">
                <input className={inputClass} value={platForm.nom} onChange={(e) => set('nom', e.target.value)} required />
              </Field>
              <Field label="Catégorie">
                <select className={inputClass} value={platForm.categorieId} onChange={(e) => set('categorieId', e.target.value)}>
                  <option value="">Sans catégorie</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.nom}</option>
                  ))}
                </select>
              </Field>
              <Field label="Prix de vente (FCFA)">
                <input type="number" min={0} step={50} className={inputClass} value={platForm.prix} onChange={(e) => set('prix', e.target.value)} required />
              </Field>
              <Field label="Coût matière (FCFA)">
                <input type="number" min={0} step={50} className={inputClass} value={platForm.cout} onChange={(e) => set('cout', e.target.value)} />
              </Field>
              <Field label="Stock disponible">
                <input type="number" min={0} className={inputClass} value={platForm.stockQuantite} onChange={(e) => set('stockQuantite', e.target.value)} />
              </Field>
              <Field label="Seuil d’alerte stock">
                <input type="number" min={0} className={inputClass} value={platForm.stockAlerte} onChange={(e) => set('stockAlerte', e.target.value)} />
              </Field>
            </div>
            <Field label="Description">
              <textarea className={inputClass} rows={2} value={platForm.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <Field label="Image (URL)">
              <input className={inputClass} value={platForm.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://…" />
            </Field>
            <div className="flex flex-wrap gap-4 text-sm font-bold text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-green-700" checked={platForm.disponible} onChange={(e) => set('disponible', e.target.checked)} />
                Disponible
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-green-700" checked={platForm.estPremium} onChange={(e) => set('estPremium', e.target.checked)} />
                Plat premium
              </label>
            </div>
            <DialogFooter>
              <button type="button" className={secondaryButtonClass} onClick={() => setPlatOpen(false)}>Annuler</button>
              <button type="submit" className={primaryButtonClass} disabled={savingPlat}>
                {savingPlat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Enregistrer
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
