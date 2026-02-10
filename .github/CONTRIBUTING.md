# Guide de contribution

Merci de votre intérêt pour contribuer à **Miam Street Food** ! 🎉

## Comment contribuer

### 🐛 Signaler un bug

1. Vérifiez que le bug n'a pas déjà été signalé dans les [Issues](https://github.com/etudiantcisse/miam-street-food/issues)
2. Créez une nouvelle issue avec le label `bug`
3. Décrivez le problème de manière détaillée :
   - Comportement attendu
   - Comportement actuel
   - Étapes pour reproduire
   - Captures d'écran si pertinent
   - Environnement (OS, navigateur, version Node.js)

### ✨ Proposer une fonctionnalité

1. Créez une issue avec le label `enhancement`
2. Expliquez clairement la fonctionnalité proposée
3. Justifiez son utilité pour le projet
4. Proposez une implémentation si possible

### 🔧 Soumettre une Pull Request

1. **Fork** le projet
2. Créez votre branche (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m '✨ Add some AmazingFeature'`)
4. Poussez vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## Standards de code

### TypeScript

- Utilisez TypeScript strict
- Définissez des types explicites pour les props et états
- Évitez `any` autant que possible

### React

- Composants fonctionnels avec Hooks
- Nommage en PascalCase pour les composants
- Un composant par fichier (sauf composants très petits et liés)

### Style

- Utilisez Tailwind CSS pour le styling
- Respectez la convention de nommage des classes
- Utilisez les composants shadcn-ui existants quand possible

### Commits

Utilisez des commits conventionnels avec emojis :

- ✨ `:sparkles:` - Nouvelle fonctionnalité
- 🐛 `:bug:` - Correction de bug
- 📝 `:memo:` - Documentation
- 🎨 `:art:` - Amélioration du style/UI
- ⚡ `:zap:` - Performance
- ♻️ `:recycle:` - Refactoring
- 🧪 `:test_tube:` - Tests
- 🔧 `:wrench:` - Configuration

Exemple : `✨ Add payment method selection in POS`

## Tests

Avant de soumettre une PR :

```bash
npm run lint        # Vérifier le code
npm run test        # Lancer les tests
npm run build       # Vérifier que le build fonctionne
```

## Code de conduite

- Soyez respectueux et constructif
- Acceptez les critiques constructives
- Concentrez-vous sur ce qui est le mieux pour la communauté
- Faites preuve d'empathie envers les autres membres

## Questions ?

N'hésitez pas à ouvrir une issue avec le label `question` si vous avez besoin d'aide !

Merci de contribuer ! 🙏
