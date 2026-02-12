/**
 * Script pour remplacer automatiquement les URLs Unsplash
 * par les chemins locaux des images réelles
 *
 * Usage: node scripts/update-product-images.js
 */

const fs = require("fs");
const path = require("path");

console.log("🚀 Mise à jour des images des produits...\n");

// Chemin vers le fichier mockData.ts
const mockDataPath = path.join(__dirname, "../src/data/mockData.ts");

// Codes des produits
const productCodes = [
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

try {
  // Lire le fichier
  let content = fs.readFileSync(mockDataPath, "utf-8");

  let updatedCount = 0;

  // Remplacer pour chaque produit
  productCodes.forEach((code) => {
    // Regex pour trouver la ligne image du produit spécifique
    // Cherche: id: 'M01', ... image: 'https://...'
    const regex = new RegExp(
      `(id: '${code}'[\\s\\S]*?image: )'https://[^']*'`,
      "g",
    );

    const replacement = `$1'/images/products/${code}.jpg'`;

    if (content.match(regex)) {
      content = content.replace(regex, replacement);
      console.log(`✅ ${code}: Image mise à jour`);
      updatedCount++;
    } else {
      console.log(`⚠️  ${code}: Non trouvé ou déjà à jour`);
    }
  });

  // Sauvegarder le fichier modifié
  fs.writeFileSync(mockDataPath, content, "utf-8");

  console.log(
    `\n🎉 Terminé ! ${updatedCount}/${productCodes.length} images mises à jour.`,
  );
  console.log("📝 Fichier: src/data/mockData.ts");
  console.log(
    "\n💡 N'oubliez pas de placer vos images dans public/images/products/",
  );
  console.log("   Format: M01.jpg, M02.jpg, etc.");
} catch (error) {
  console.error("❌ Erreur:", error.message);
  process.exit(1);
}
