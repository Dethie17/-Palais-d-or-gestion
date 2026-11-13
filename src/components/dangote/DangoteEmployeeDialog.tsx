import { useEffect, useState } from 'react';
import { Loader2, Save, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { dangoteApi } from '@/lib/dangote';
import type { DangoteEmploye } from '@/types/dangote';
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from './DangoteUI';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entiteId: string;
  employe?: DangoteEmploye | null;
  onSaved: () => void;
}

interface FormState {
  matricule: string;
  nom: string;
  prenom: string;
  service: string;
  poste: string;
  email: string;
  telephone: string;
  dateEmbauche: string;
  dateFin: string;
  plafondJournalier: string;
  plafondMensuel: string;
  notes: string;
  actif: boolean;
  withAccount: boolean;
  username: string;
  password: string;
}

const empty: FormState = {
  matricule: '',
  nom: '',
  prenom: '',
  service: '',
  poste: '',
  email: '',
  telephone: '',
  dateEmbauche: '',
  dateFin: '',
  plafondJournalier: '',
  plafondMensuel: '',
  notes: '',
  actif: true,
  withAccount: false,
  username: '',
  password: '',
};

export default function DangoteEmployeeDialog({ open, onOpenChange, entiteId, employe, onSaved }: Props) {
  const editing = Boolean(employe);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (employe) {
      setForm({
        ...empty,
        matricule: employe.matricule,
        nom: employe.nom,
        prenom: employe.prenom,
        service: employe.service ?? '',
        poste: employe.poste ?? '',
        email: employe.email ?? '',
        telephone: employe.telephone ?? '',
        dateEmbauche: employe.date_embauche ?? '',
        dateFin: employe.date_fin ?? '',
        plafondJournalier: employe.plafond_journalier != null ? String(employe.plafond_journalier) : '',
        plafondMensuel: employe.plafond_mensuel != null ? String(employe.plafond_mensuel) : '',
        notes: employe.notes ?? '',
        actif: employe.actif,
        withAccount: false,
        username: '',
        password: '',
      });
    } else {
      setForm(empty);
    }
  }, [open, employe]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        entiteId,
        matricule: form.matricule,
        nom: form.nom,
        prenom: form.prenom,
        service: form.service,
        poste: form.poste,
        email: form.email,
        telephone: form.telephone,
        dateEmbauche: form.dateEmbauche,
        dateFin: form.dateFin,
        plafondJournalier: form.plafondJournalier,
        plafondMensuel: form.plafondMensuel,
        notes: form.notes,
        actif: form.actif,
      };
      if (editing && employe) {
        payload.id = employe.id;
        await dangoteApi('employee.update', payload);
        toast.success('Employé mis à jour.');
      } else {
        payload.username = form.withAccount ? form.username : '';
        payload.password = form.withAccount ? form.password : '';
        await dangoteApi('employee.create', payload);
        toast.success(form.withAccount ? 'Employé et compte créés.' : 'Employé ajouté.');
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-green-700" />
            {editing ? 'Modifier l’employé' : 'Ajouter un employé'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Mettez à jour la fiche sans toucher au QR code existant.'
              : 'Créez la fiche. Un compte de connexion est optionnel : le superviseur peut valider les repas avec le QR seul.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Matricule" hint="Laissez vide pour une génération automatique.">
              <input className={inputClass} value={form.matricule} onChange={(e) => set('matricule', e.target.value)} placeholder="DGT-001" />
            </Field>
            <Field label="Service">
              <input className={inputClass} value={form.service} onChange={(e) => set('service', e.target.value)} placeholder="Production, RH, Logistique…" />
            </Field>
            <Field label="Nom">
              <input className={inputClass} value={form.nom} onChange={(e) => set('nom', e.target.value)} required />
            </Field>
            <Field label="Prénom">
              <input className={inputClass} value={form.prenom} onChange={(e) => set('prenom', e.target.value)} required />
            </Field>
            <Field label="Poste">
              <input className={inputClass} value={form.poste} onChange={(e) => set('poste', e.target.value)} placeholder="Opérateur, Chef d’équipe…" />
            </Field>
            <Field label="Téléphone">
              <input className={inputClass} value={form.telephone} onChange={(e) => set('telephone', e.target.value)} placeholder="77 123 45 67" />
            </Field>
            <Field label="Email">
              <input type="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Date d’embauche">
              <input type="date" className={inputClass} value={form.dateEmbauche} onChange={(e) => set('dateEmbauche', e.target.value)} />
            </Field>
            <Field label="Plafond journalier (FCFA)" hint="Vide = pas de plafond.">
              <input type="number" min={0} className={inputClass} value={form.plafondJournalier} onChange={(e) => set('plafondJournalier', e.target.value)} />
            </Field>
            <Field label="Plafond mensuel (FCFA)" hint="Vide = pas de plafond.">
              <input type="number" min={0} className={inputClass} value={form.plafondMensuel} onChange={(e) => set('plafondMensuel', e.target.value)} />
            </Field>
            {editing ? (
              <Field label="Date de fin">
                <input type="date" className={inputClass} value={form.dateFin} onChange={(e) => set('dateFin', e.target.value)} />
              </Field>
            ) : null}
            {editing ? (
              <Field label="Statut">
                <select className={inputClass} value={form.actif ? '1' : '0'} onChange={(e) => set('actif', e.target.value === '1')}>
                  <option value="1">Actif</option>
                  <option value="0">Désactivé</option>
                </select>
              </Field>
            ) : null}
          </div>

          <Field label="Notes internes">
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>

          {!editing ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-green-700 focus:ring-green-600"
                  checked={form.withAccount}
                  onChange={(e) => set('withAccount', e.target.checked)}
                />
                Créer un compte de connexion employé
              </label>
              <p className="mt-1 text-xs text-slate-500">
                L’employé pourra consulter son QR, son quota et son historique. Sans compte, le QR reste utilisable au comptoir.
              </p>
              {form.withAccount ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Nom d’utilisateur">
                    <input className={inputClass} value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="prenom.nom" required={form.withAccount} />
                  </Field>
                  <Field label="Mot de passe" hint="8 caractères minimum.">
                    <input type="password" className={inputClass} value={form.password} onChange={(e) => set('password', e.target.value)} required={form.withAccount} />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <button type="button" className={secondaryButtonClass} onClick={() => onOpenChange(false)}>
              Annuler
            </button>
            <button type="submit" className={primaryButtonClass} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
