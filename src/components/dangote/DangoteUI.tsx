import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function DangotePageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-950/40 bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 px-5 py-6 text-white shadow-xl shadow-emerald-950/10 md:px-7 md:py-7">
      <div aria-hidden className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
      <div aria-hidden className="absolute -bottom-24 left-1/4 h-56 w-56 rounded-full bg-amber-300/10 blur-3xl" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/40 to-transparent" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3.5">
          {icon ? (
            <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200/20 bg-white/10 text-amber-100 shadow-inner backdrop-blur">
              {icon}
            </div>
          ) : null}
          <div>
            {eyebrow ? (
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/90">{eyebrow}</p>
            ) : null}
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white md:text-3xl">{title}</h1>
            {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-emerald-50/70">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'blue' | 'slate';
}) {
  const tones: Record<string, { card: string; icon: string; label: string; value: string; hint: string }> = {
    default: {
      card: 'border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80',
      icon: 'bg-slate-100 text-slate-600',
      label: 'text-slate-500',
      value: 'text-slate-900',
      hint: 'text-slate-500',
    },
    green: {
      card: 'border-emerald-200/70 bg-gradient-to-br from-emerald-50 via-white to-white',
      icon: 'bg-emerald-100 text-emerald-700',
      label: 'text-emerald-700/80',
      value: 'text-emerald-950',
      hint: 'text-emerald-700/70',
    },
    amber: {
      card: 'border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-white',
      icon: 'bg-amber-100 text-amber-700',
      label: 'text-amber-700/80',
      value: 'text-amber-950',
      hint: 'text-amber-700/70',
    },
    red: {
      card: 'border-rose-200/70 bg-gradient-to-br from-rose-50 via-white to-white',
      icon: 'bg-rose-100 text-rose-700',
      label: 'text-rose-700/80',
      value: 'text-rose-950',
      hint: 'text-rose-700/70',
    },
    blue: {
      card: 'border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-white',
      icon: 'bg-sky-100 text-sky-700',
      label: 'text-sky-700/80',
      value: 'text-sky-950',
      hint: 'text-sky-700/70',
    },
    slate: {
      card: 'border-slate-900 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white',
      icon: 'bg-white/10 text-amber-100',
      label: 'text-emerald-100/70',
      value: 'text-white',
      hint: 'text-emerald-100/60',
    },
  };
  const style = tones[tone] ?? tones.default;
  return (
    <div className={cn('group rounded-2xl border p-5 shadow-sm shadow-slate-200/40 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/60', style.card)}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn('text-[10px] font-black uppercase tracking-[0.16em]', style.label)}>{label}</p>
        {icon ? <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', style.icon)}>{icon}</span> : null}
      </div>
      <p className={cn('mt-3 text-2xl font-black tracking-tight md:text-[1.7rem]', style.value)}>{value}</p>
      {hint ? <p className={cn('mt-1.5 text-xs font-medium', style.hint)}>{hint}</p> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40', className)}>
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title ? <h2 className="text-base font-black tracking-tight text-slate-900">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-gradient-to-b from-slate-50/80 to-white px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="text-sm font-black text-slate-700">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{description}</p> : null}
    </div>
  );
}

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm font-medium text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-emerald-700" /> {label}
    </div>
  );
}

export function SchemaBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-black">Installation incomplète</p>
        <p className="mt-0.5 text-xs leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

export function StatusBadge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    blue: 'bg-sky-50 text-sky-700 border-sky-200',
  };
  const dot: Record<string, string> = {
    slate: 'bg-slate-400',
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-rose-500',
    blue: 'bg-sky-500',
  };
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold', tones[tone])}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400';

export const selectClass = inputClass;

export const primaryButtonClass =
  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-700 px-4 py-2 text-sm font-black text-white shadow-sm shadow-emerald-700/20 transition hover:from-emerald-700 hover:to-emerald-800 focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButtonClass =
  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-50';

export const dangerButtonClass =
  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50';

export function ProgressBar({ value, tone = 'green' }: { value: number; tone?: 'green' | 'amber' | 'red' }) {
  const tones: Record<string, string> = {
    green: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    amber: 'bg-gradient-to-r from-amber-400 to-amber-500',
    red: 'bg-gradient-to-r from-rose-500 to-rose-600',
  };
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn('h-full rounded-full transition-all duration-500', tones[tone])} style={{ width: `${safe}%` }} />
    </div>
  );
}
