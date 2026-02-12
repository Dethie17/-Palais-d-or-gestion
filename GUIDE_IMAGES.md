# 📸 Guide d'Ajout des Images Réelles des Produits

## 🎯 Objectif

Ce guide explique comment remplacer les images de stock par vos vraies photos de produits.

---

## 📁 Structure des Fichiers

```
fooddash-hub-main/
├── public/
│   └── images/
│       └── products/          ← Créez ce dossier
│           ├── M01.jpg        ← Mini Tacos
│           ├── M02.jpg        ← Tacos
│           ├── M03.jpg        ← Fataya Complet
│           ├── ...
│           └── M21.jpg        ← Eau
```

---

## 📋 Étapes pour Ajouter Vos Images

### Étape 1: Préparez vos photos

1. **Prenez des photos de qualité**:
   - Utilisez un bon éclairage (lumière naturelle si possible)
   - Fond neutre (blanc, bois clair, etc.)
   - Cadrage centré sur le produit
   - Résolution: minimum 800x800 pixels

2. **Optimisez les fichiers**:
   - Format: JPG ou WebP (recommandé)
   - Dimension: 800x800 pixels (carré)
   - Poids: < 200 KB par image
   - Outil recommandé: [TinyPNG](https://tinypng.com)

3. **Nommez les fichiers**:
   ```
   M01.jpg  → Mini Tacos
   M02.jpg  → Tacos
   M03.jpg  → Fataya Complet
   M04.jpg  → Crépe Salé
   M05.jpg  → Crépe Sucré
   M06.jpg  → Chandwitch Poulet
   M07.jpg  → Chandwitch Viande
   M08.jpg  → Burger
   M09.jpg  → Mini Burger
   M10.jpg  → Mini Fataya
   M11.jpg  → Fondé
   M12.jpg  → Lakh
   M13.jpg  → Boisson Gazeuse
   M14.jpg  → Jus Naturel
   M15.jpg  → Mini Cake
   M16.jpg  → Cake
   M17.jpg  → Pain Au Lait
   M18.jpg  → Nems
   M19.jpg  → Mini Pizza
   M20.jpg  → Pain Omlette
   M21.jpg  → Eau
   ```

---

### Étape 2: Placez les images dans le projet

1. Créez le dossier `public/images/products/`
2. Copiez toutes vos images dans ce dossier
3. Vérifiez que les noms correspondent exactement aux codes (M01.jpg, M02.jpg, etc.)

---

### Étape 3: Mettez à jour le code

Ouvrez le fichier `src/data/mockData.ts` et remplacez les URLs Unsplash:

**AVANT:**

```typescript
{
  id: 'M01',
  name: 'Mini Tacos',
  category: 'Tacos',
  price: 500,
  description: 'Délicieux mini tacos croustillants',
  image: 'https://images.unsplash.com/photo-...',  // ← À remplacer
  available: true
},
```

**APRÈS:**

```typescript
{
  id: 'M01',
  name: 'Mini Tacos',
  category: 'Tacos',
  price: 500,
  description: 'Délicieux mini tacos croustillants',
  image: '/images/products/M01.jpg',  // ← Nouvelle image locale
  available: true
},
```

---

### Étape 4: Automatisation (Optionnel)

Pour remplacer toutes les images en une fois, utilisez ce script:

**Créez un fichier `scripts/update-images.js`:**

```javascript
const fs = require("fs");

const mockDataPath = "./src/data/mockData.ts";
let content = fs.readFileSync(mockDataPath, "utf-8");

// Remplace toutes les URLs Unsplash par les images locales
const products = [
  "M01",
  "M02",
  "M03",
  "M04",
  "M05",
  "M06",
  "M07",
  "M08",
  "M09",
  "M10",
  "M11",
  "M12",
  "M13",
  "M14",
  "M15",
  "M16",
  "M17",
  "M18",
  "M19",
  "M20",
  "M21",
];

products.forEach((code) => {
  // Cherche la ligne avec image: 'https://...' pour chaque produit
  const regex = new RegExp(
    `(id: '${code}'[\\s\\S]*?image: )'https://[^']*'`,
    "g",
  );
  content = content.replace(regex, `$1'/images/products/${code}.jpg'`);
});

fs.writeFileSync(mockDataPath, content);
console.log("✅ Images mises à jour avec succès !");
```

**Exécutez:**

```bash
node scripts/update-images.js
```

---

## ✅ Checklist de Vérification

Avant de lancer l'application, vérifiez:

- [ ] Toutes les images sont au format carré (800x800)
- [ ] Les noms de fichiers correspondent aux codes (M01-M21)
- [ ] Les images sont dans `public/images/products/`
- [ ] Le fichier `mockData.ts` a été mis à jour
- [ ] Les images s'affichent correctement dans l'app

---

## 🎨 Conseils de Photographie

### Pour les Tacos et Burgers

- Vue de 3/4 (angle légèrement de côté)
- Montrez la garniture
- Fond uni (planche en bois, assiette blanche)

### Pour les Boissons

- Vue droite, centrée
- Fond blanc ou couleur unie
- Condensation sur le verre (effet frais)

### Pour les Desserts

- Vue du dessus ou 3/4
- Mise en valeur de la texture
- Lumière douce

### Pour les Sandwichs

- Coupé en deux pour voir l'intérieur
- Vue de face ou 3/4
- Fond neutre

---

## 🚀 Résultat

Une fois terminé, votre menu affichera vos vraies photos et sera beaucoup plus attractif pour vos clients !

**AVANT (Stock):**

```
🌮 Mini Tacos    [Image Unsplash générique]    500 FCFA
```

**APRÈS (Vos photos):**

```
🌮 Mini Tacos    [VOTRE VRAI PRODUIT]    500 FCFA
```

---

## 🆘 Besoin d'Aide ?

Si vous rencontrez des problèmes:

1. Vérifiez que les fichiers existent dans le bon dossier
2. Vérifiez l'orthographe des noms (majuscules/minuscules)
3. Rechargez l'application avec Ctrl+R
4. Videz le cache du navigateur (Ctrl+Shift+R)

---

_Happy Cooking! 🍔👨‍🍳_
