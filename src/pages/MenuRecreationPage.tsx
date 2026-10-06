import { useEffect, useState } from 'react';
import { WeeklyMenu, WeeklyMenuItem } from '@/types/menu';
import { formatCurrency } from '@/lib/utils';
import { useResto } from '@/context/RestoContext';
import { QRCodeSVG } from 'qrcode.react';
import { WAVE_BUSINESS_URL, WAVE_BUSINESS_NAME, INTOUCH_MERCHANT_NAME, INTOUCH_USSD_URL } from '@/lib/wave';

import {
  CalendarDays, Utensils, Banknote, Smartphone, QrCode, CheckCircle,
  XCircle, ArrowLeft, CreditCard, Copy, AlertCircle, ExternalLink,
  Loader2, RefreshCw
} from 'lucide-react';

const DAY_INDEX = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

type POSStep = 'select' | 'payment' | 'qrcode';

interface MenuRecreationPageProps {
  onNavigate?: (page: string) => void;
}

const MenuRecreationPage = ({ onNavigate }: MenuRecreationPageProps) => {
  const { weeklyMenus, createWalkInTicket } = useResto();
  const [step, setStep] = useState<POSStep>('select');
  const [selectedMenu, setSelectedMenu] = useState<WeeklyMenu | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wave' | 'intouch'>('cash');
  const [ticketToken, setTicketToken] = useState<string | null>(null);
  const [ticketReference, setTicketReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // InTouch state
  const [intouchCode, setIntouchCode] = useState<string>('');
  const [intouchConfirming, setIntouchConfirming] = useState(false);
  const [intouchLinkCopied, setIntouchLinkCopied] = useState(false);

  const todayName = DAY_INDEX[new Date().getDay()];
  const todayMenu = weeklyMenus.find((m) => m.day === todayName && (m.items ?? []).length > 0);

  const otherMenus = weeklyMenus.filter((m) => m.day !== todayName && (m.items ?? []).length > 0);

  const handleSelectMenu = (menu: WeeklyMenu) => {
    setSelectedMenu(menu);
    setStep('payment');
    setError(null);
    setSuccess(null);
  };

  const handlePaymentMethodChange = (method: 'cash' | 'wave' | 'intouch') => {
    setPaymentMethod(method);
    setError(null);
  };

  const handleConfirmPayment = async () => {
    if (!selectedMenu) return;
    setError(null);
    setSuccess(null);

    if (paymentMethod === 'cash') {
      // Paiement espèces : immédiat
      const { token, reference } = createWalkInTicket(selectedMenu, 'cash');
      setTicketToken(token);
      setTicketReference(reference);
      setStep('qrcode');
      setSuccess('Paiement espèces validé ✓');
      return;
    }

    // Paiement Wave : le caissier confirme que le client a payé
    const { token, reference } = createWalkInTicket(selectedMenu, 'wave');
    setTicketToken(token);
    setTicketReference(reference);
    setStep('qrcode');
    setSuccess('Paiement Wave validé ✓');
  };

  const [linkCopied, setLinkCopied] = useState(false);

  const copyWaveLink = async () => {
    try {
      await navigator.clipboard.writeText(WAVE_BUSINESS_URL);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  const copyIntouchLink = async () => {
    try {
      await navigator.clipboard.writeText(INTOUCH_USSD_URL || '#');
      setIntouchLinkCopied(true);
      setTimeout(() => setIntouchLinkCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  const handleConfirmIntouch = async () => {
    if (!selectedMenu || intouchCode.length !== 6) return;
    setError(null);
    setSuccess(null);
    setIntouchConfirming(true);

    try {
      // En mode démo, on vérifie avec le code stocké
      const { checkWaveCode } = await import('@/lib/wave');
      const intouchRef = `INT-${Date.now().toString(36).toUpperCase()}`;
      const valid = checkWaveCode(intouchRef, intouchCode.trim());

      if (!valid) {
        setError('Code invalide ou expiré. Réessayez.');
        setIntouchConfirming(false);
        return;
      }

      // Code valide : créer le ticket
      const { token, reference } = createWalkInTicket(selectedMenu, 'intouch');
      setTicketToken(token);
      setTicketReference(reference);
      setStep('qrcode');
      setSuccess('Paiement InTouch validé ✓');
    } catch {
      setError('Erreur de validation. Réessayez.');
    } finally {
      setIntouchConfirming(false);
    }
  };

  const handleBack = () => {
    if (step === 'payment') {
      setStep('select');
      setSelectedMenu(null);
      setPaymentMethod('cash');
      setIntouchCode('');
      setIntouchConfirming(false);
      setIntouchLinkCopied(false);
    } else if (step === 'qrcode') {
      setStep('payment');
      setTicketToken(null);
      setTicketReference(null);
    }
  };

  const handleNewSale = () => {
    setStep('select');
    setSelectedMenu(null);
    setPaymentMethod('cash');
    setTicketToken(null);
    setTicketReference(null);
    setError(null);
    setSuccess(null);
    setIntouchCode('');
    setIntouchConfirming(false);
    setIntouchLinkCopied(false);
  };

  const copyToken = () => {
    if (ticketToken) {
      navigator.clipboard.writeText(ticketToken);
      setSuccess('Code copié dans le presse-papiers');
    }
  };

  const formatMenuItems = (items: WeeklyMenuItem[]) => {
    if (!items.length) return 'Menu non détaillé';
    return items.map((i) => i.name).join(', ');
  };

  if (!todayMenu && !otherMenus.length) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center p-8">
          <CalendarDays className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800">Aucun menu publié</h2>
          <p className="mt-2 text-slate-500 max-w-md mx-auto">
            Le Personnel doit composer les menus de la semaine dans « Gestion Menu » pour qu'ils apparaissent ici.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => onNavigate?.('home')} className="lg:hidden p-2 hover:bg-slate-100 rounded-xl">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Menu Récréation — Vente non-abonnés</h1>
          <p className="text-slate-500">Choix du menu · Paiement espèces ou Wave · QR pour le service</p>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center gap-2 text-sm font-medium">
          <CheckCircle className="w-5 h-5" /> {success}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl flex items-center gap-2 text-sm font-medium">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {/* ÉTAPE 1 : Choix du menu */}
      {step === 'select' && (
        <div className="space-y-4">
          {todayMenu && (
            <div className="bg-gradient-to-r from-slate-500 to-red-600 rounded-2xl p-6 text-white shadow-lg">
              <div className="flex items-center gap-3 mb-2">
                <CalendarDays className="w-6 h-6" />
                <span className="text-lg font-bold">Aujourd'hui — {todayMenu.day}</span>
              </div>
              <p className="text-xl font-bold">{todayMenu.name || `Menu du ${todayMenu.day}`}</p>
              <p className="mt-1 opacity-90">{todayMenu.description}</p>
              <div className="mt-3 flex items-center gap-4 text-sm opacity-90">
                <span className="flex items-center gap-1"><Utensils className="w-4 h-4" /> {formatMenuItems(todayMenu.items ?? [])}</span>
                <span className="flex items-center gap-1 font-bold text-lg">{formatCurrency(todayMenu.price ?? 0)}</span>
              </div>
              <button
                onClick={() => handleSelectMenu(todayMenu)}
                className="mt-4 w-full py-3 bg-white text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
              >
                <CreditCard className="w-5 h-5" /> Choisir ce menu
              </button>
            </div>
          )}

          {otherMenus.length > 0 && (
            <div>
              <h3 className="font-bold text-slate-800 mb-3">Autres jours publiés</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {otherMenus.map((menu) => (
                  <button
                    key={menu.day}
                    onClick={() => handleSelectMenu(menu)}
                    className="bg-white rounded-2xl border-2 border-slate-200 p-5 hover:border-slate-500 hover:shadow-xl transition-all text-left"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarDays className="w-5 h-5 text-slate-500" />
                      <span className="font-bold text-slate-800">{menu.day}</span>
                    </div>
                    <p className="font-semibold text-slate-800">{menu.name || `Menu du ${menu.day}`}</p>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{menu.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-slate-500">{formatMenuItems(menu.items ?? [])}</span>
                      <span className="text-xl font-bold text-slate-600">{formatCurrency(menu.price ?? 0)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ÉTAPE 2 : Paiement */}
      {step === 'payment' && selectedMenu && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-sm text-slate-500">{selectedMenu.day}</p>
                <h3 className="text-xl font-bold text-slate-800">{selectedMenu.name || `Menu du ${selectedMenu.day}`}</h3>
                <p className="text-sm text-slate-500 mt-1">{formatMenuItems(selectedMenu.items ?? [])}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-600">{formatCurrency(selectedMenu.price ?? 0)}</p>
                <p className="text-xs text-slate-400">Total à payer</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => handlePaymentMethodChange('cash')}
                className={`py-4 rounded-xl font-bold text-lg transition-all ${paymentMethod === 'cash'
                  ? 'bg-gradient-to-r from-slate-500 to-red-600 text-white shadow-lg shadow-slate-500/30'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <Banknote className="w-6 h-6 mx-auto mb-1" /> Espèces
              </button>
              <button
                onClick={() => handlePaymentMethodChange('wave')}
                className={`py-4 rounded-xl font-bold text-lg transition-all ${paymentMethod === 'wave'
                  ? 'bg-gradient-to-r from-green-500 to-teal-600 text-white shadow-lg shadow-green-500/30'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:border-green-300'
                }`}
              >
                <Smartphone className="w-6 h-6 mx-auto mb-1" /> Wave
              </button>
              <button
                onClick={() => handlePaymentMethodChange('intouch')}
                className={`py-4 rounded-xl font-bold text-lg transition-all ${paymentMethod === 'intouch'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30'
                  : 'bg-white border-2 border-slate-200 text-slate-700 hover:border-blue-300'
                }`}
              >
                <Smartphone className="w-6 h-6 mx-auto mb-1" /> InTouch
              </button>
            </div>

            {paymentMethod === 'wave' && (
              <div className="space-y-4">
                <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50 to-white p-5 text-center">
                  <p className="text-xs font-black uppercase tracking-widest text-blue-600 flex items-center justify-center gap-1.5">
                    <Smartphone className="w-4 h-4" /> Paiement Wave Business
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{WAVE_BUSINESS_NAME}</p>
                  <p className="text-3xl lg:text-4xl font-black text-slate-900 mt-2">{formatCurrency(selectedMenu.price ?? 0)}</p>
                  <p className="text-xs text-slate-500 mt-1">Le client paie exactement ce montant via le lien ou le QR.</p>
                  <div className="mt-4 inline-block p-3 bg-white rounded-2xl border shadow-sm">
                    <QRCodeSVG value={WAVE_BUSINESS_URL} size={170} level="M" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <a
                      href={WAVE_BUSINESS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700"
                    >
                      <ExternalLink className="w-4 h-4" /> Ouvrir le lien
                    </a>
                    <button
                      onClick={copyWaveLink}
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50"
                    >
                      <Copy className="w-4 h-4" /> {linkCopied ? 'Copié !' : 'Copier'}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                    Vérifiez la notification Wave Business sur le téléphone, puis cliquez ci-dessous sur « Paiement Wave reçu ».
                  </p>
                </div>

                <button
                  onClick={handleConfirmPayment}
                  className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" /> Client a payé — Générer le ticket
                </button>
              </div>
            )}

            {paymentMethod === 'intouch' && (
              <div className="space-y-4">
                <div className="rounded-2xl border-2 border-purple-200 bg-gradient-to-b from-purple-50 to-white p-5 text-center">
                  <p className="text-xs font-black uppercase tracking-widest text-purple-600 flex items-center justify-center gap-1.5">
                    <Smartphone className="w-4 h-4" /> Paiement InTouch
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{INTOUCH_MERCHANT_NAME}</p>
                  <p className="text-3xl lg:text-4xl font-black text-slate-900 mt-2">{formatCurrency(selectedMenu.price ?? 0)}</p>
                  <p className="text-xs text-slate-500 mt-1">Le client paie exactement ce montant via InTouch.</p>
                  <div className="mt-4 inline-block p-3 bg-white rounded-2xl border shadow-sm">
                    <QRCodeSVG value={INTOUCH_USSD_URL || '#'} size={170} level="M" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      onClick={copyIntouchLink}
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50"
                    >
                      <Copy className="w-4 h-4" /> {intouchLinkCopied ? 'Copié !' : 'Copier USSD'}
                    </button>
                    <button
                      onClick={() => setIntouchCode('')}
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50"
                    >
                      <RefreshCw className="w-4 h-4" /> Réinitialiser
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                    Le client compose *144# sur son téléphone, suit les instructions, puis vous cliquez sur « Client a payé ».
                  </p>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-semibold text-purple-800 mb-1">Code de confirmation InTouch (6 chiffres)</label>
                  <input
                    type="text"
                    value={intouchCode}
                    onChange={(e) => setIntouchCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Ex: 123456"
                    maxLength={6}
                    className="w-full px-4 py-3 rounded-xl border-2 border-purple-200 text-center text-2xl font-bold tracking-widest outline-none focus:border-purple-500"
                    autoFocus
                  />
                </div>

                <button
                  onClick={handleConfirmIntouch}
                  disabled={intouchCode.length !== 6}
                  className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {intouchConfirming ? (
                    <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Validation...</span>
                  ) : (
                    <span className="flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5" /> Valider le code InTouch</span>
                  )}
                </button>
              </div>
            )}

            <button
              onClick={paymentMethod === 'cash' ? handleConfirmPayment : () => {}}
              disabled={paymentMethod === 'wave'}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${paymentMethod === 'cash'
                ? 'bg-gradient-to-r from-slate-500 to-red-600 text-white shadow-lg shadow-slate-500/30 hover:shadow-xl'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {paymentMethod === 'cash' ? (
                <span className="flex items-center justify-center gap-2"><Banknote className="w-5 h-5" /> Confirmer le paiement espèces</span>
              ) : (
                <span className="flex items-center justify-center gap-2"><Smartphone className="w-5 h-5" /> Valider le paiement Wave ci-dessus</span>
              )}
            </button>
          </div>

          <button onClick={handleBack} className="w-full py-3 text-slate-600 font-medium hover:text-slate-800 flex items-center justify-center gap-2">
            <ArrowLeft className="w-5 h-5" /> Revenir au choix du menu
          </button>
        </div>
      )}

      {/* ÉTAPE 3 : QR Code généré */}
      {step === 'qrcode' && ticketToken && (
        <div className="space-y-6 animate-scale-in">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-emerald-800">Paiement validé !</h2>
            <p className="mt-2 text-emerald-700">Le ticket visiteur est prêt à être scanné</p>
          </div>

          <div className="bg-white rounded-2xl border p-6 shadow-sm space-y-4">
            <div className="text-center">
              <p className="text-sm text-slate-500">Code ticket :</p>
              <p className="font-mono font-bold text-lg text-slate-800 tracking-wider">{ticketToken}</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <button onClick={copyToken} className="px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 flex items-center gap-1">
                  <Copy className="w-4 h-4" /> Copier
                </button>
              </div>
            </div>

            <div className="relative inline-block mx-auto p-4 bg-white rounded-xl border">
              <QRCodeSVG value={ticketToken} size={200} level="M" />
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <p className="font-semibold text-slate-800">{selectedMenu?.name || `Menu du ${selectedMenu?.day}`}</p>
              <p className="text-slate-600">{formatMenuItems(selectedMenu?.items ?? [])}</p>
              <p className="font-bold text-slate-600">{formatCurrency(selectedMenu?.price ?? 0)}</p>
              <p className="text-xs text-slate-500">Réf: {ticketReference}</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center text-sm text-amber-800">
              <p className="font-bold flex items-center justify-center gap-1"><QrCode className="w-4 h-4" /> À scanner par le personnel pour le service</p>
              <p className="mt-1">Le client présente ce QR à la cantine</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleNewSale} className="flex-1 py-3.5 bg-gradient-to-r from-slate-500 to-red-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-slate-500/50 transition-all">
              Nouvelle vente
            </button>
            <button onClick={handleBack} className="px-6 py-3.5 border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors">
              Modifier paiement
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuRecreationPage;