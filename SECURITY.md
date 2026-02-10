# Politique de Sécurité

## 🔒 Versions supportées

Actuellement, seule la dernière version de **Miam Street Food** reçoit des mises à jour de sécurité.

| Version | Support          |
| ------- | ---------------- |
| 1.0.x   | ✅ Supportée     |
| < 1.0   | ❌ Non supportée |

## 🚨 Signaler une vulnérabilité

La sécurité de nos utilisateurs est notre priorité. Si vous découvrez une vulnérabilité de sécurité, merci de nous en informer de manière responsable.

### Comment signaler ?

**NE CRÉEZ PAS d'issue publique** pour les problèmes de sécurité.

À la place, veuillez :

1. **Envoyer un email** à l'équipe de sécurité (si disponible)
2. **Créer une Security Advisory** sur GitHub :
   - Allez dans l'onglet "Security" du dépôt
   - Cliquez sur "Report a vulnerability"
   - Remplissez le formulaire avec les détails

### Informations à fournir

Pour nous aider à comprendre et corriger rapidement la vulnérabilité, incluez :

- 📝 **Description** : Nature de la vulnérabilité
- 🎯 **Impact** : Quel est le risque potentiel ?
- 📋 **Étapes** : Comment reproduire le problème ?
- 💻 **Environnement** : Version, navigateur, OS
- 🔧 **Solution suggérée** : Si vous en avez une
- 📸 **Captures/Logs** : Si pertinent (sans données sensibles)

### Processus de traitement

1. **Accusé de réception** dans les 48 heures
2. **Évaluation initiale** dans les 7 jours
3. **Mise à jour du statut** tous les 7 jours
4. **Correction planifiée** selon la gravité :
   - 🔴 Critique : < 7 jours
   - 🟠 Haute : < 30 jours
   - 🟡 Moyenne : < 90 jours
   - 🟢 Basse : Prochaine version
5. **Publication du patch** et remerciements

### Divulgation responsable

Nous vous demandons de :

- ✅ Ne pas exploiter la vulnérabilité
- ✅ Ne pas divulguer publiquement avant le correctif
- ✅ Nous laisser un délai raisonnable pour corriger
- ✅ Agir de bonne foi

En retour, nous nous engageons à :

- ✅ Répondre rapidement
- ✅ Tenir informé de l'avancement
- ✅ Créditer la découverte (sauf si anonymat souhaité)
- ✅ Publier un correctif dans les meilleurs délais

## 🛡️ Bonnes pratiques de sécurité

Si vous déployez cette application en production :

### Configuration
- [ ] Utiliser HTTPS uniquement
- [ ] Configurer les en-têtes de sécurité (CSP, HSTS, etc.)
- [ ] Mettre en place un WAF (Web Application Firewall)
- [ ] Activer la protection CSRF
- [ ] Limiter les tentatives de connexion

### Données
- [ ] Ne jamais stocker de données sensibles en clair
- [ ] Utiliser des variables d'environnement pour les secrets
- [ ] Sauvegarder régulièrement les données
- [ ] Anonymiser les données de test

### Dépendances
- [ ] Mettre à jour régulièrement les dépendances
- [ ] Auditer avec `npm audit` ou `yarn audit`
- [ ] Utiliser Dependabot pour les alertes
- [ ] Vérifier les licences des dépendances

### Accès
- [ ] Implémenter une authentification forte
- [ ] Utiliser des rôles et permissions
- [ ] Logger les actions sensibles
- [ ] Mettre en place une détection d'intrusion

### Monitoring
- [ ] Surveiller les logs d'erreur
- [ ] Alerter sur les activités suspectes
- [ ] Avoir un plan de réponse aux incidents
- [ ] Effectuer des audits de sécurité réguliers

## 📚 Ressources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [npm Security Best Practices](https://docs.npmjs.com/packages-and-modules/securing-your-code)
- [React Security Cheatsheet](https://cheatsheetseries.owasp.org/cheatsheets/React_Security_Cheat_Sheet.html)
- [Web Security Academy](https://portswigger.net/web-security)

## 🏆 Hall of Fame

Nous remercions les chercheurs en sécurité qui ont contribué à améliorer la sécurité de notre projet :

<!-- La liste sera mise à jour au fur et à mesure -->

---

**Merci de contribuer à la sécurité de Miam Street Food ! 🙏**

*Dernière mise à jour : 10 février 2026*
