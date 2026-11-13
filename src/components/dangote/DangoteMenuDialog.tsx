import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { dangoteApi, formatDateFr, formatMoney } from '@/lib/dangote';
import type { DangoteCategorie, DangoteMenu, DangoteMenuPlat, DangotePlat } from '@/types/dangote';
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from './DangoteUI';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entiteId: string;
  dateJour: string;
  typeRepas: 'standard' | 'premium';
  menu?: DangoteMenu | null;
  menuPlats: DangoteMenuPlat[];
  plats: DangotePlat[];
  categories: DangoteCategorie[];
  defaultPrix: number;
  onSaved: () => void;
}

export default function DangoteMenuDialog({
  open,
  onOpenChange,
  entiteId,
  dateJour,
  typeRepas,
  menu,
  menuPlats,
  plats,
  categories,
  defaultPrix,
  onSaved,
}: Props) {
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [prix, setPrix] = useState(String(defaultPrix));
  const [actif, setActif] = useState(true);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setActif(menu?.actif ?? true);
    setTitre(menu?.titre ?? '');
    setDescription(menu?.description ?? '');
    setPrix(String(menu?.prix ?? defaultPrix));
    const initial: Record<string, number> = {};
    if (menu) {
      for (const item of menuPlats.filter((row) => row.menu_id === menu.id)) {
        initial[item.plat_id] = item.quantite;
      }
    }
    setSelected(initial);
  }, [open, menu, menuPlats, defaultPrix]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, { nom: string; plats: DangotePlat[] }>();
    for (const plat of plats) {
      const category = categories.find((item) => item.id === plat.categorie_id);
      const key = plat.categorie_id ?? 'sans-categorie';
      const entry = byCategory.get(key) ?? { nom: category?.nom ?? 'Sans catégorie', plats: [] };
      entry.plats.push(plat);
      byCategory.set(key, entry);
    }
    return Array.from(byCategory.entries())
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => {
        const catA = categories.find((item) => item.id === a.id);
        const catB = categories.find((item) => item.id === b.id);
        return (catA?.ordre ?? 999) - (catB?.ordre ?? 999);
      });
  }, [plats, categories]);

  const toggle = (platId: string) => {
    setSelected((current) => {
      const next = { ...current };
      if (next[platId]) delete next[platId];
      else next[platId] = 1;
      return next;
    });
  };

  const setQuantity = (platId: string, quantity: number) => {
    setSelected((current) => ({ ...current, [platId]: Math.max(1, Math.min(20, quantity || 1)) }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await dangoteApi('menu.save', {
        entiteId,
        dateJour,
        typeRepas,
        titre,
        description,
        prix: Number(prix),
        actif,
        plats: Object.entries(selected).map(([platId, quantite]) => ({ platId, quantite })),
      });
      toast.success('Menu enregistré.');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = Object.keys(selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-green-700" />
            {menu ? 'Modifier le menu' : 'Créer un menu'}
          </DialogTitle>
          <DialogDescription>
            {formatDateFr(dateJour)} — menu {typeRepas}. Le prix saisi fait foi au moment de la validation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Field label="Titre du menu">
              <input className={inputClass} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Poulet braisé, riz, salade" required />
            </Field>
            <Field label="Prix (FCFA)">
              <input type="number" min={0} step={50} className={inputClass} value={prix} onChange={(e) => setPrix(e.target.value)} required />
            </Field>
          </div>

          <Field label="Description">
            <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Détail des plats, accompagnements, boisson…" />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-600" checked={actif} onChange={(e) => setActif(e.target.checked)} />
            Menu actif et visible au comptoir
          </label>

          <div className="rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-black text-slate-900">Composition du menu</p>
              <span className="text-xs text-slate-500">{selectedCount} plat{selectedCount > 1 ? 's' : ''} sélectionné{selectedCount > 1 ? 's' : ''}</span>
            </div>
            <div className="max-h-64 space-y-4 overflow-y-auto p-4">
              {grouped.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun plat au catalogue. Ajoutez d’abord des plats dans l’onglet Menus.</p>
              ) : null}
              {grouped.map((group) => (
                <div key={group.id}>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">{group.nom}</p>
                  <div className="space-y-1.5">
                    {group.plats.map((plat) => {
                      const checked = Boolean(selected[plat.id]);
                      return (
                        <div key={plat.id} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-600"
                            checked={checked}
                            onChange={() => toggle(plat.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-slate-800">{plat.nom}</p>
                            <p className="text-xs text-slate-500">{formatMoney(plat.prix)}</p>
                          </div>
                          {checked ? (
                            <input
                              type="number"
                              min={1}
                              max={20}
                              className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-center text-xs"
                              value={selected[plat.id]}
                              onChange={(e) => setQuantity(plat.id, Number(e.target.value))}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <button type="button" className={secondaryButtonClass} onClick={() => onOpenChange(false)}>
              Annuler
            </button>
            <button type="submit" className={primaryButtonClass} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Enregistrement…' : 'Enregistrer le menu'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
