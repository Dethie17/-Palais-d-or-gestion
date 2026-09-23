import { useState } from 'react';

interface OrestoLogoProps {
  variant?: 'full' | 'mark';
  className?: string;
  imgClassName?: string;
}

/**
 * Logo officiel O RESTO (extrait de Logo/O_RESTO_logo.pdf).
 * - Variante 'full' : /logo.png (logo complet avec baseline).
 * - Variante 'mark' : /o-resto-mark.png (sigle assiette + toque).
 * - Repli automatique sur le vectoriel /o-resto-logo.svg ou /o-resto-mark.svg.
 */
export default function OrestoLogo({ variant = 'full', className = '', imgClassName = '' }: OrestoLogoProps) {
  const [failedPng, setFailedPng] = useState(false);
  const src = variant === 'full' ? '/logo.png' : '/o-resto-mark.png';
  const fallback = variant === 'full' ? '/o-resto-logo.svg' : '/o-resto-mark.svg';

  if (failedPng) {
    return (
      <img
        src={fallback}
        alt="O RESTO — Gestion des repas et abonnements pour écoles et entreprises"
        className={imgClassName || className}
      />
    );
  }

  return (
    <img
      src={src}
      alt="O RESTO"
      className={imgClassName || className}
      onError={(e) => {
        // Si le PNG est absent -> bascule vectoriel (une seule fois, pas de boucle).
        const el = e.currentTarget;
        if (!el.src.endsWith('.svg')) {
          setFailedPng(true);
        }
      }}
    />
  );
}

/** Petit badge mark pour sidebar / QR / favicon */
export function OrestoMark({ className = 'w-10 h-10' }: { className?: string }) {
  return <OrestoLogo variant="mark" imgClassName={`${className} object-contain`} />;
}

/** Logo complet vertical pour login / impression */
export function OrestoFullLogo({ className = 'w-40' }: { className?: string }) {
  return <OrestoLogo variant="full" imgClassName={`${className} object-contain`} />;
}
