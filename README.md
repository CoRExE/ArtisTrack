# 🚌 ArtisTrack - Réseau de Bus Artis (Arras)

Application mobile **React Native (Expo)** permettant de suivre les bus et horaires du réseau **Artis (Communauté Urbaine d'Arras)**, conçue pour être **100% autonome et hors-ligne** grâce aux données ouvertes officielles GTFS compilées dans une base de données SQLite locale (~9 Mo).

---

## ✨ Fonctionnalités

* ⏱️ **Prochains passages en direct :** Calcul des prochains bus avec décompte temps réel (*ex: dans 4 min*), basé sur l'heure courante et le calendrier GTFS officiel.
* 📍 **Recherche & Arrêts proches :** Recherche rapide d'arrêts avec autocomplétion instantanée et détection par géolocalisation des arrêts à proximité.
* 🎨 **53 Lignes avec couleurs officielles :** Lignes urbaines (L1 à L10), Citadines et Navettes (ACTI, ARTOIS, CIT), Périurbaines (L11 à L18), Circuits scolaires et TAD.
* 🗺️ **Tracé et fiches horaires :** Consultation du parcours des lignes par direction et grille horaire complète de la journée pour chaque arrêt.
* ❤️ **Gestion des favoris :** Enregistrement des arrêts et lignes du quotidien pour un accès en 1 clic.
* 📡 **100% Hors-ligne :** Aucune limitation de quota, zéro coût d'API, temps de réponse quasi instantané (< 1 ms).

---

## 🛠️ Stack technique & Gestionnaire de paquets

* **Package Manager :** [Bun](https://bun.sh/)
* **Framework :** React Native avec [Expo SDK 57](https://expo.dev/) (TypeScript)
* **Base de données :** [`expo-sqlite`](https://docs.expo.dev/versions/latest/sdk/sqlite/) avec base précompilée embarquée
* **Géolocalisation :** `expo-location`
* **Stockage local :** `@react-native-async-storage/async-storage`
* **Iconographie :** `lucide-react-native`

---

## 🚀 Démarrage rapide

### 1. Installation des dépendances
```bash
bun install
```

### 2. Lancement de l'application
```bash
# Démarrer le serveur de développement Expo
bun start

# Ou directement sur simulateur iOS / Android :
bun run ios
bun run android
```

### 3. Mise à jour de la base de données GTFS
Pour télécharger le dernier fichier GTFS officiel depuis `transport.data.gouv.fr` et régénérer `assets/data/artis.db` :
```bash
bun run build:db
```

---

## 📁 Architecture du projet

```
ArtisTrack/
├── App.tsx                     # Entrée de l'application & barre d'onglets
├── assets/
│   └── data/
│       └── artis.db            # Base SQLite précompilée (~9 Mo, 1 170 arrêts, 53 lignes)
├── metro.config.js             # Configuration Metro pour supporter les assets .db
├── package.json
├── scripts/
│   └── build-db.py             # Pipeline de téléchargement GTFS et génération SQLite
└── src/
    ├── components/
    │   ├── DepartureCard.tsx   # Carte de bus avec décompte temps réel
    │   └── RouteBadge.tsx      # Pastille de ligne avec couleur officielle
    ├── screens/
    │   ├── DeparturesScreen.tsx# Écran départs, recherche et géolocalisation
    │   ├── FavoritesScreen.tsx # Écran favoris
    │   ├── NetworkInfoScreen.tsx # Écran infos Artis & numéros utiles
    │   └── RoutesScreen.tsx    # Écran des lignes, tracés et fiches horaires
    ├── services/
    │   ├── artisService.ts     # Moteur de requêtes SQLite (calendrier, arrêts, horaires)
    │   └── favoritesService.ts # Gestionnaire de favoris (AsyncStorage)
    ├── theme/
    │   └── colors.ts           # Charte graphique officielle Artis
    └── types/
        └── gtfs.ts             # Typages TypeScript
```
