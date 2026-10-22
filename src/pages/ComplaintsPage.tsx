import { useMemo, useRef, useState } from 'react';
import { useResto } from '@/context/RestoContext';
import { useAuth } from '@/context/AuthContext';
import { getRoleDef } from '@/lib/roleTasks';
import ComplaintPhoto from '@/components/ComplaintPhoto';
import {
  COMPLAINT_CATEGORY_LABEL,
  COMPLAINT_STATUS_LABEL,
  type Complaint,
  type ComplaintCategory,
  type ComplaintStatus,
} from '@/types/menu';
import { uploadComplaintPhoto, COMPLAINT_PHOTO_ACCEPT } from '@/lib/complaintPhotos';
import {
  MessageSquareWarning,
  Search,
  Send,
  Megaphone,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  Paperclip,
  RotateCcw,
  Baby,
  Plus,
} from 'lucide-react';

const STATUS_STYLE: Record<ComplaintStatus, string> = {
  open: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-slate-200 text-slate-600',
};

const STATUS_ORDER: ComplaintStatus[] = ['open', 'in_progress', 'resolved', 'rejected'];

const CATEGORIES = Object.keys(COMPLAINT_CATEGORY_LABEL) as ComplaintCategory[];

/**
 * Canal de discussion des réclamations —Superviseur cantine.
 * Côtéencadrement : une liste de fils (filtres statut + recherche) et le fil
 * actif avec réponse, pièces jointes et changement de statut.
 * Le superviseur peut aussi publier une annonce visible par tous les parents.
 */
const ComplaintsPage = () => {
  const { complaints, messagesOf, replyComplaint, setComplaintStatus, publishAnnouncement, parentProfiles, myChildren, myComplaints, addComplaint } = useResto();
  const { user } = useAuth();
  const me = getRoleDef(user?.role);
  const parentMode = user?.role === 'client';
  const parentUsername = user?.username ?? '';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [uploading, setUploading] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [announce, setAnnounce] = useState({ subject: '', body: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPhoto = useRef<File | null>(null);

  const files = complaints.filter((c) => !c.isAnnouncement);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files
      .filter((c) => (statusFilter === 'all' ? true : c.status === statusFilter))
      .filter((c) => {
        if (!q) return true;
        const prof = parentProfiles.find((p) => p.parentUsername === c.clientUsername);
        const kids = myChildren(c.clientUsername);
        return [
          c.reference, c.subject, c.clientUsername,
          prof ? `${prof.firstName} ${prof.lastName} ${prof.phone}` : '',
          ...kids.map((k) => `${k.firstName} ${k.lastName}`),
        ].join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const rank = (c: Complaint) => STATUS_ORDER.indexOf(c.status === 'open' || c.status === 'in_progress' ? 'open' : c.status);
        return rank(a) - rank(b) || +new Date(b.updatedAt) - +new Date(a.updatedAt);
      });
  }, [files, search, statusFilter, parentProfiles, myChildren]);

  const selected: Complaint | null = useMemo(
    () => files.find((c) => c.id === selectedId) ?? filtered[0] ?? null,
    [files, selectedId, filtered],
  );

  const counts = useMemo(
    () => ({
      open: files.filter((c) => c.status === 'open').length,
      in_progress: files.filter((c) => c.status === 'in_progress').length,
      resolved: files.filter((c) => c.status === 'resolved').length,
      rejected: files.filter((c) => c.status === 'rejected').length,
    }),
    [files],
  );

  // Vue parent : ses propres fils + les annonces, avec un formulaire de création.
  if (parentMode) {
    return <ParentComplaints username={parentUsername} />;
  }

  const childName = (c: Complaint) => {
    const k = c.childId ? myChildren(c.clientUsername).find((x) => x.id === c.childId) : undefined;
    return k ? `${k.firstName} ${k.lastName} · ${k.className}` : null;
  };

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingPhoto.current = file;
    setFlash({ ok: true, text: 'Photo jointe — elle sera envoyée avec le message.' });
    e.target.value = '';
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    const staff = user?.username ?? '';
    if (!staff) return;
    const body = reply.trim();
    setReply('');
    let photoPath: string | undefined;
    const file = pendingPhoto.current;
    pendingPhoto.current = null;
    if (file) {
      setUploading(true);
      const res = await uploadComplaintPhoto(file, selected.id);
      setUploading(false);
      if (res.ok) photoPath = res.path;
      else if ('message' in res) setFlash({ ok: false, text: res.message });
    }
    try {
      replyComplaint(selected.id, staff, 'staff', body, photoPath);
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Envoi impossible.' });
    }
  };

  const sendAnnouncement = () => {
    try {
      publishAnnouncement(user?.username ?? 'superviseur', announce.subject, announce.body);
      setAnnounce({ subject: '', body: '' });
      setAnnounceOpen(false);
      setFlash({ ok: true, text: 'Annonce publiée — visible par tous les parents.' });
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Publication impossible.' });
    }
  };

  const filters: { id: ComplaintStatus | 'all'; label: string; count: number }[] = [
    { id: 'all', label: 'Tous', count: files.length },
    { id: 'open', label: 'Nouvelles', count: counts.open },
    { id: 'in_progress', label: 'En cours', count: counts.in_progress },
    { id: 'resolved', label: 'Résolues', count: counts.resolved },
    { id: 'rejected', label: 'Rejetées', count: counts.rejected },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Canal parents · {files.length} réclamation{files.length > 1 ? 's' : ''}
          </p>
          <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <MessageSquareWarning className="w-7 h-7 text-amber-600" /> Réclamations
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Connecté en <strong>{me.title}</strong> — vous répondez directement aux parents.
          </p>
        </div>
        <button
          onClick={() => setAnnounceOpen((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
        >
          <Megaphone className="w-4 h-4" /> Publier une annonce
        </button>
      </div>

      {flash && (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium border ${flash.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {flash.text}
        </p>
      )}

      {announceOpen && (
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-5 space-y-3">
          <p className="text-sm font-black text-slate-900">Annonce à tous les parents</p>
          <input
            value={announce.subject}
            onChange={(e) => setAnnounce((a) => ({ ...a, subject: e.target.value }))}
            placeholder="Objet (ex :Menu de jeudi modifié)"
            className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600"
          />
          <textarea
            value={announce.body}
            onChange={(e) => setAnnounce((a) => ({ ...a, body: e.target.value }))}
            placeholder="Message affiché dans l’Accès Abonné de tous les utilisateurs."
            rows={3}
            className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 resize-y"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAnnounceOpen(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 border border-slate-200">
              Annuler
            </button>
            <button
              onClick={sendAnnouncement}
              disabled={!announce.subject.trim() || !announce.body.trim()}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-700 text-white disabled:opacity-40"
            >
              Publier
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === f.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {f.label} · {f.count}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(300px,380px)_1fr] gap-5 items-start">
        {/* ---------- Liste des fils ---------- */}
        <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden">
          <div className="relative border-b border-slate-100 p-3">
            <Search aria-hidden className="w-4 h-4 absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Référence, parent, enfant…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">Aucune réclamation à traiter.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${selected?.id === c.id ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black text-slate-400 tabular-nums">{c.reference}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>
                        {COMPLAINT_STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-slate-900 truncate">{c.subject}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {c.clientUsername} · {COMPLAINT_CATEGORY_LABEL[c.category]}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ---------- Fil actif ---------- */}
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-5 min-h-[400px]">
          {!selected ? (
            <p className="text-sm text-slate-400 text-center py-16">Sélectionnez une réclamation.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-dashed border-slate-200">
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-slate-400 tabular-nums">{selected.reference}</p>
                  <h2 className="text-lg font-black text-slate-900">{selected.subject}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {selected.clientUsername} · {COMPLAINT_CATEGORY_LABEL[selected.category]}
                    {childName(selected) && (
                      <span className="inline-flex items-center gap-1 ml-2 text-slate-600">
                        <Baby className="w-3.5 h-3.5" /> {childName(selected)}
                      </span>
                    )}
                  </p>
                </div>
                <span className={`text-xs font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 ${STATUS_STYLE[selected.status]}`}>
                  {selected.status === 'open' && <Clock className="w-3.5 h-3.5" />}
                  {selected.status === 'in_progress' && <RotateCcw className="w-3.5 h-3.5" />}
                  {selected.status === 'resolved' && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {selected.status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                  {COMPLAINT_STATUS_LABEL[selected.status]}
                </span>
              </div>

              <ul className="space-y-3 py-4 max-h-[45vh] overflow-y-auto">
                {messagesOf(selected.id).map((m) => {
                  const fromStaff = m.authorRole === 'staff';
                  return (
                    <li key={m.id} className={`flex ${fromStaff ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${fromStaff ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
                        <p className={`text-[10px] font-black uppercase tracking-wider ${fromStaff ? 'text-emerald-300' : 'text-slate-500'}`}>
                          {fromStaff ? 'Superviseur' : m.authorUsername}
                        </p>
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">{m.body}</p>
                        {m.photoPath && <ComplaintPhoto path={m.photoPath} className="mt-2" />}
                        <p className={`text-[10px] mt-1.5 ${fromStaff ? 'text-slate-400' : 'text-slate-400'}`}>
                          {new Date(m.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap gap-2 py-3 border-t border-dashed border-slate-200">
                {STATUS_ORDER.filter((s) => s !== selected.status).map((s) => (
                  <button
                    key={s}
                    onClick={() => setComplaintStatus(selected.id, s)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border ${STATUS_STYLE[s]} border-transparent hover:opacity-80`}
                  >
                    Marquer « {COMPLAINT_STATUS_LABEL[s]} »
                  </button>
                ))}
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Répondre au parent…"
                  rows={2}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 resize-y"
                />
                <input ref={fileInputRef} type="file" accept={COMPLAINT_PHOTO_ACCEPT} onChange={pickPhoto} className="hidden" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Joindre une photo"
                  className="px-3 py-3 rounded-xl border-2 border-slate-200 text-slate-500 hover:border-slate-400"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>
                <button
                  onClick={sendReply}
                  disabled={!reply.trim() || uploading}
                  className="px-4 py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-40"
                >
                  <Send className="w-4 h-4" /> Répondre
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Réponses envoyées depuis <strong>{me.title}</strong> · chaque parent ne voit que ses propres
        fils, plus les annonces publiées.
      </p>
    </div>
  );
};

/**
 * Vue parent du canal réclamations : ses propres fils + les annonces de la
 * cantine, ouverture d'un nouveau fil et réponses. Simple et visible :
 * pas de gestion de statut, pas d'outils d'encadrement.
 */
function ParentComplaints({ username }: { username: string }) {
  const { complaints, messagesOf, myComplaints, addComplaint, replyComplaint, myChildren } = useResto();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'meal_quality' as ComplaintCategory, childId: '' });
  const [body, setBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingPhoto = useRef<File | null>(null);

  const kids = myChildren(username);
  const threads = useMemo(
    () => [
      ...myComplaints(username),
      ...complaints.filter((c) => c.isAnnouncement),
    ].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [myComplaints, username, complaints],
  );
  const selected: Complaint | null = threads.find((c) => c.id === selectedId) ?? threads[0] ?? null;

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingPhoto.current = file;
    setFlash({ ok: true, text: 'Photo jointe — elle sera envoyée avec le message.' });
    e.target.value = '';
  };

  const sendPhoto = async (complaintId: string): Promise<string | undefined> => {
    const file = pendingPhoto.current;
    pendingPhoto.current = null;
    if (!file) return undefined;
    setUploading(true);
    const res = await uploadComplaintPhoto(file, complaintId);
    setUploading(false);
    if (res.ok) return res.path;
    if ('message' in res) setFlash({ ok: false, text: res.message });
    return undefined;
  };

  const createThread = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const photoPath = await sendPhoto('nouveau');
      const created = addComplaint({
        clientUsername: username,
        childId: form.childId || undefined,
        category: form.category,
        subject: form.subject,
        body,
        photoPath,
      });
      setForm({ subject: '', category: 'meal_quality', childId: '' });
      setBody('');
      setOpen(false);
      setSelectedId(created.id);
      setFlash({ ok: true, text: `Réclamation ${created.reference} envoyée — le Superviseur répond dans ce fil.` });
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Envoi impossible.' });
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    try {
      const photoPath = await sendPhoto(selected.id);
      replyComplaint(selected.id, username, 'client', reply.trim(), photoPath);
      setReply('');
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Envoi impossible.' });
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
            Canal cantine · {myComplaints(username).length} fil{myComplaints(username).length > 1 ? 's' : ''}
          </p>
          <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-slate-900 flex items-center gap-2">
            <MessageSquareWarning className="w-7 h-7 text-amber-600" /> Réclamations
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Parlez directement au Superviseur de la cantine — il répond dans votre fil.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nouvelle réclamation
        </button>
      </div>

      {flash && (
        <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium border ${flash.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
          {flash.text}
        </p>
      )}

      {open && (
        <form onSubmit={createThread} className="bg-white rounded-2xl border-2 border-slate-100 p-5 space-y-3" data-testid="new-complaint-form">
          <p className="text-sm font-black text-slate-900">Nouvelle réclamation</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Objet (ex : repas froid de mardi)"
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600"
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ComplaintCategory }))}
              aria-label="Catégorie"
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-emerald-600"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{COMPLAINT_CATEGORY_LABEL[c]}</option>
              ))}
            </select>
            <select
              value={form.childId}
              onChange={(e) => setForm((f) => ({ ...f, childId: e.target.value }))}
              aria-label="Enfant concerné"
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm bg-white outline-none focus:border-emerald-600"
            >
              <option value="">Aucun enfant précis</option>
              {kids.map((k) => (
                <option key={k.id} value={k.id}>{k.firstName} {k.lastName} · {k.className}</option>
              ))}
            </select>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Décrivez ce qui s'est passé…"
            rows={3}
            className="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 resize-y"
          />
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <input ref={fileInputRef} type="file" accept={COMPLAINT_PHOTO_ACCEPT} onChange={pickPhoto} className="hidden" />
            {pendingPhoto.current && <span className="text-xs font-bold text-slate-500">Photo jointe</span>}
            <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600">
              Joindre une photo
            </button>
            <button
              type="submit"
              disabled={!form.subject.trim() || !body.trim() || uploading}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-700 text-white disabled:opacity-40"
            >
              Envoyer
            </button>
          </div>
        </form>
      )}

      <div className="grid lg:grid-cols-[minmax(280px,340px)_1fr] gap-5 items-start">
        <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden">
          {threads.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">Aucune réclamation — écrivez quand vous voulez.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
              {threads.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${selected?.id === c.id ? 'bg-emerald-50/70' : 'hover:bg-slate-50'}`}
                  >
                    {c.isAnnouncement ? (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">Annonce</span>
                    ) : (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>
                        {COMPLAINT_STATUS_LABEL[c.status]}
                      </span>
                    )}
                    <p className="mt-1 text-sm font-bold text-slate-900 truncate">{c.subject}</p>
                    <p className="text-xs text-slate-500">{COMPLAINT_CATEGORY_LABEL[c.category]}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl border-2 border-slate-100 p-5 min-h-[400px]">
          {!selected ? (
            <p className="text-sm text-slate-400 text-center py-16">Choisissez un fil ou créez une réclamation.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-dashed border-slate-200">
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-slate-400 tabular-nums">{selected.reference}</p>
                  <h2 className="text-lg font-black text-slate-900">{selected.subject}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{COMPLAINT_CATEGORY_LABEL[selected.category]}</p>
                </div>
                {selected.isAnnouncement ? (
                  <span className="text-xs font-black px-3 py-1.5 rounded-full bg-sky-100 text-sky-700">Annonce</span>
                ) : (
                  <span className={`text-xs font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 ${STATUS_STYLE[selected.status]}`}>
                    {selected.status === 'open' && <Clock className="w-3.5 h-3.5" />}
                    {selected.status === 'in_progress' && <RotateCcw className="w-3.5 h-3.5" />}
                    {selected.status === 'resolved' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {selected.status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                    {COMPLAINT_STATUS_LABEL[selected.status]}
                  </span>
                )}
              </div>

              <ul className="space-y-3 py-4 max-h-[45vh] overflow-y-auto">
                {messagesOf(selected.id).map((m) => {
                  const fromStaff = m.authorRole === 'staff';
                  return (
                    <li key={m.id} className={`flex ${fromStaff ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${fromStaff ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
                        <p className={`text-[10px] font-black uppercase tracking-wider ${fromStaff ? 'text-emerald-300' : 'text-slate-500'}`}>
                          {fromStaff ? 'Superviseur' : 'Vous'}
                        </p>
                        <p className="text-sm mt-1 whitespace-pre-wrap break-words">{m.body}</p>
                        {m.photoPath && <ComplaintPhoto path={m.photoPath} className="mt-2" />}
                        <p className="text-[10px] mt-1.5 text-slate-400">
                          {new Date(m.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      </div>
                    </li>
                  );
                })}
                {messagesOf(selected.id).length === 0 && (
                  <li className="text-sm text-slate-400 text-center py-6">Aucun message dans ce fil.</li>
                )}
              </ul>

              {!selected.isAnnouncement && (
                <div className="flex items-end gap-2">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Répondre…"
                    rows={2}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm outline-none focus:border-emerald-600 resize-y"
                  />
                  <input ref={fileInputRef} type="file" accept={COMPLAINT_PHOTO_ACCEPT} onChange={pickPhoto} className="hidden" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Joindre une photo"
                    className="px-3 py-3 rounded-xl border-2 border-slate-200 text-slate-500 hover:border-slate-400"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={sendReply}
                    disabled={!reply.trim() || uploading}
                    className="px-4 py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" /> Envoyer
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComplaintsPage;