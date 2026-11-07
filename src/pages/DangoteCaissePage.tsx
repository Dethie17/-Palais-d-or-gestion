import { useAuth } from '@/context/AuthContext';

const DangoteCaissePage = () => {
  const { user } = useAuth();
  return (
    <div className="p-4 lg:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Caisse Dangote</h1>
      <p className="text-slate-500">Bienvenue {user?.username}. Scan QR et validation des repas (module en cours).</p>
    </div>
  );
};

export default DangoteCaissePage;
EOF