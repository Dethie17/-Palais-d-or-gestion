import { Product } from '@/types/menu';

// PLATS DU CATALOGUE O RESTO (menus du jour)
// Ces produits servent à initialiser la base de données Supabase si elle est vide
export const categories = ['Tous', 'Tacos', 'Sandwichs', 'Burgers', 'Fataya', 'Crêpes', 'Pizza', 'Accompagnements', 'Boissons', 'Desserts', 'Récréation', 'Pause'];

export const categoryIcons: Record<string, string> = {
  'Tous': 'restaurant_menu',
  'Tacos': 'lunch_dining',
  'Sandwichs': 'fastfood',
  'Burgers': 'lunch_dining',
  'Fataya': 'bakery_dining',
  'Crêpes': 'breakfast_dining',
  'Pizza': 'local_pizza',
  'Accompagnements': 'tapas',
  'Boissons': 'local_cafe',
  'Desserts': 'cake',
  'Récréation': 'sports_esports',
  'Pause': 'coffee',
};

// Liste complète des produits (21 produits)
export const mockProducts: Product[] = [
  // --- KIOSQUES RÉCRÉATION & PAUSE (nouvelle section) ---
  // Articles de récréation (midi/fin d'après-midi)
  { id: 'K01', name: 'Mini Tacos', category: 'recreation', price: 500, description: 'Délicieux mini tacos croustillants', image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=400&fit=crop', available: true },
  { id: 'K02', name: 'Tacos', category: 'recreation', price: 1500, description: 'Tacos généreux garni à votre goût', image: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=400&h=400&fit=crop', available: true },
  { id: 'K03', name: 'Mini Burger', category: 'recreation', price: 300, description: 'Mini burger parfait pour petite faim', image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400&h=400&fit=crop', available: true },
  { id: 'K04', name: 'Fataya Complet', category: 'recreation', price: 600, description: 'Fataya garni, croustillant et savoureux', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&h=400&fit=crop', available: true },
  { id: 'K05', name: 'Mini Fataya', category: 'recreation', price: 100, description: 'Petit fataya croustillant', image: 'https://images.unsplash.com/photo-1623428187969-5da2dcea5ebf?w=400&h=400&fit=crop', available: true },
  // Articles de pause (boissons/snacks)
  { id: 'K06', name: 'Crêpe Salée', category: 'pause', price: 500, description: 'Crêpe salée garnie selon vos goûts', image: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=400&h=400&fit=crop', available: true },
  { id: 'K07', name: 'Crêpe Sucrée', category: 'pause', price: 300, description: 'Crêpe sucrée pour les gourmands', image: 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&h=400&fit=crop', available: true },
  { id: 'K08', name: 'Thiakry', category: 'pause', price: 300, description: 'Dessert lacté traditionnel bien frais', image: 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=400&h=400&fit=crop', available: true },
  { id: 'K09', name: 'Boisson Gazeuse', category: 'pause', price: 400, description: 'Boisson gazeuse fraîche', image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=400&fit=crop', available: true },
  { id: 'K10', name: 'Jus Naturel', category: 'pause', price: 300, description: 'Jus de fruits frais 100% naturel', image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&h=400&fit=crop', available: true },
  { id: 'K11', name: 'Eau', category: 'pause', price: 150, description: 'Eau minérale fraîche', image: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop', available: true },
  { id: 'K12', name: 'Mini Cake', category: 'pause', price: 50, description: 'Petit gâteau moelleux', image: 'https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?w=400&h=400&fit=crop', available: true },
  { id: 'K13', name: 'Cake', category: 'pause', price: 300, description: 'Gâteau moelleux et savoureux', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=400&fit=crop', available: true },
  { id: 'K14', name: 'Pain Au Lait', category: 'pause', price: 150, description: 'Pain au lait moelleux et doux', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=400&fit=crop', available: true },
  // Accompagnements communs
  { id: 'K15', name: 'Fondant du jour', category: 'recreation', price: 250, description: 'Accompagnement fondant du jour', image: 'https://images.unsplash.com/photo-1582169296194-e4d644c48063?w=400&h=400&fit=crop', available: true },
  { id: 'K16', name: 'Nems', category: 'recreation', price: 150, description: 'Nems croustillants et savoureux', image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop', available: true },
];

// Les commandes et statistiques viennent de votre base de données Supabase
// Plus besoin de données mockées !

// ---------- Menus composés Miam's (menu de la semaine Lun–Ven) ----------
// Chaque menu est achetable comme "Ticket repas" (1 repas crédité, valable 7 jours).
export interface ComposedMenuItem {
  name: string;
  price: number;
}

export interface ComposedMenu {
  id: string;
  name: string;
  day: string;
  description: string;
  items: ComposedMenuItem[];
  total: number;
  formulaId: string;
  image: string;
}

export const composedMenus: ComposedMenu[] = [
  {
    id: 'CM1',
    name: 'Menu Élève',
    day: 'Lundi',
    description: 'Léger et équilibré pour bien démarrer la semaine',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&h=400&fit=crop',
    items: [
      { name: 'Mini Fataya', price: 100 },
      { name: 'Sandwich Poulet', price: 500 },
      { name: 'Jus Naturel', price: 400 },
    ],
    total: 1000,
    formulaId: 'T1',
  },
  {
    id: 'CM2',
    name: 'Menu Gourmand',
    day: 'Mardi',
    description: 'Le généreux : tacos complet',
    image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=400&fit=crop',
    items: [
      { name: 'Tacos', price: 2000 },
      { name: 'Boisson Gazeuse', price: 500 },
    ],
    total: 2500,
    formulaId: 'F1',
  },
  {
    id: 'CM3',
    name: 'Menu Petit Budget',
    day: 'Mercredi',
    description: 'Le malin : complet à moins de 500 FCFA',
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&h=400&fit=crop',
    items: [
      { name: 'Mini Pizza', price: 200 },
      { name: 'Eau', price: 150 },
      { name: 'Mini Cake', price: 50 },
    ],
    total: 400,
    formulaId: 'F2',
  },
  {
    id: 'CM4',
    name: 'Menu Goûter',
    day: 'Jeudi',
    description: 'Douceur sucrée de l’après-midi',
    image: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=600&h=400&fit=crop',
    items: [
      { name: 'Crêpe Sucrée', price: 300 },
      { name: 'Jus Naturel', price: 300 },
    ],
    total: 600,
    formulaId: 'F3',
  },
  {
    id: 'CM5',
    name: 'Menu Burger',
    day: 'Vendredi',
    description: 'On finit la semaine en beauté',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=400&fit=crop',
    items: [
      { name: 'Burger', price: 1300 },
      { name: 'Jus Naturel', price: 300 },
    ],
    total: 1600,
    formulaId: 'C10',
  },
];
