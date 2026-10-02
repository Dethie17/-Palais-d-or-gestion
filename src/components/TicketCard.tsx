import { ReactNode } from 'react';
import { Ticket as TicketIcon, UtensilsCrossed } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export interface TicketMenuItem {
  name: string;
  price: number;
}

interface TicketCardProps {
  day: string;
  name: string;
  description?: string;
  image?: string;
  items: TicketMenuItem[];
  total: number;
  highlight?: boolean;
  highlightLabel?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Ticket repas de cantine — présentation soignée et identique partout
 * (Menus = vitrine, Abonnement = achat). Photo du menu, souche jour,
 * pointillés de séparation, plats (sans prix unitaires) + total détachable.
 */
const TicketCard = ({ day, name, description, image, items, total, highlight, highlightLabel, action, className }: TicketCardProps) => {
  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden flex flex-col ${highlight ? 'border-green-500 ring-2 ring-green-200' : 'border-slate-100'} ${className ?? ''}`}>
      {/* Photo du menu */}
      {image && (
        <div className="relative h-36 overflow-hidden">
          <img src={image} alt={`${name} — ${day}`} loading="lazy" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <span className="absolute bottom-2 left-3 flex items-center gap-1.5 text-sm font-black uppercase tracking-widest text-white drop-shadow">
            <TicketIcon className="w-4 h-4" /> {day}
          </span>
          {highlight && (
            <span className="absolute top-2 right-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white text-green-700 shadow">
              {highlightLabel ?? 'AUJOURD’HUI'}
            </span>
          )}
        </div>
      )}
      {/* Souche (sans photo) */}
      {!image && (
        <div className="bg-gradient-to-r from-green-700 to-green-600 px-4 py-3 flex items-center justify-between text-white">
          <span className="flex items-center gap-1.5 text-sm font-black uppercase tracking-widest">
            <TicketIcon className="w-4 h-4" /> {day}
          </span>
          {highlight ? (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white text-green-700">{highlightLabel ?? 'AUJOURD’HUI'}</span>
          ) : (
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/20">Ticket repas</span>
          )}
        </div>
      )}
      {/* Corps */}
      <div className="p-4 flex flex-col flex-1">
        <p className="font-extrabold text-slate-900">{name}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
          {items.map((it) => (
            <li key={it.name} className="flex items-center gap-1.5">
              <UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" /> {it.name}
            </li>
          ))}
        </ul>
        {/* Pointillés + total */}
        <div className="mt-3 pt-3 border-t-2 border-dashed border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Total ticket</span>
          <span className="text-xl font-black text-slate-900">{formatCurrency(total)}</span>
        </div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
};

export default TicketCard;
