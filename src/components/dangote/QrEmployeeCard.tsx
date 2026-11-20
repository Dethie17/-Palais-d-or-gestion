import { QRCodeSVG } from 'qrcode.react';

export interface QrEmployeeCardData {
  matricule: string;
  nom: string;
  prenom: string;
  telephone?: string | null;
  photo_url?: string | null;
}

interface QrEmployeeCardProps {
  employe: QrEmployeeCardData;
  compact?: boolean;
}

/**
 * Carte employé premium : photo optionnelle, identité, matricule et QR.
 * Le QR encode le matricule, accepté par le scanner du superviseur.
 */
export const QrEmployeeCard = ({ employe, compact = false }: QrEmployeeCardProps) => {
  const fullName = `${employe.prenom} ${employe.nom}`.trim();
  const initials = `${employe.prenom.charAt(0)}${employe.nom.charAt(0)}`.toUpperCase();

  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/60 bg-white/70 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-emerald-50 ring-4 ring-emerald-100">
          {employe.photo_url ? (
            <img
              src={employe.photo_url}
              alt={fullName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl font-black text-emerald-700">{initials}</span>
          )}
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-black text-slate-900">{fullName}</h2>
          <p className="text-sm text-slate-500">Matricule : {employe.matricule}</p>
          {employe.telephone ? (
            <p className="text-sm text-slate-500">Téléphone : {employe.telephone}</p>
          ) : null}
        </div>

        {!compact ? (
          <div className="rounded-xl bg-white p-3 shadow-inner">
            <QRCodeSVG
              value={employe.matricule}
              size={180}
              bgColor="#ffffff"
              fgColor="#0f172a"
              level="M"
            />
          </div>
        ) : null}

        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          MIAM'S Dangote
        </p>
      </div>
    </div>
  );
};

export default QrEmployeeCard;
