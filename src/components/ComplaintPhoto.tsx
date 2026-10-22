import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { signedComplaintUrl } from '@/lib/complaintPhotos';

interface ComplaintPhotoProps {
  path?: string;
  alt?: string;
  className?: string;
}

/** Affiche une pièce jointe de réclamation via URL signée (bucket privé). */
const ComplaintPhoto = ({ path, alt = 'Pièce jointe', className = '' }: ComplaintPhotoProps) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    if (!path) {
      setUrl(null);
      return;
    }
    signedComplaintUrl(path).then((signed) => {
      if (!active) return;
      setUrl(signed);
      if (!signed) setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (!path) return null;

  if (failed || !url) {
    return (
      <p className={`inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 ${className}`}>
        <ImageOff className="w-3.5 h-3.5" />
        Pièce jointe indisponible hors connexion
      </p>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className={`inline-block ${className}`}>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="h-24 w-24 rounded-xl object-cover border border-slate-200 hover:opacity-90 transition-opacity"
      />
    </a>
  );
};

export default ComplaintPhoto;