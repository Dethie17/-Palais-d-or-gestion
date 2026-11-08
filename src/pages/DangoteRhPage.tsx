import { useAuth } from '@/context/AuthContext';

const DangoteRhPage = () => {
  const { user } = useAuth();
  return (
    <div className="p-4 lg:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Espace Ressource Humaine — Dangote</h1>
      <p className="text-slate-500">Bienvenue {user?.username}. Gestion RH (module en cours).</p>
    </div>
  );
};

export default DangoteRhPage;