import { useAuth } from '@/context/AuthContext';

const DangoteDchPage = () => {
  const { user } = useAuth();
  return (
    <div className="p-4 lg:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Espace DCH — Dangote</h1>
      <p className="text-slate-500">Bienvenue {user?.username}. Gestion des employés, achats de talons et crédit repas (module en cours).</p>
    </div>
  );
};

export default DangoteDchPage;
EOF