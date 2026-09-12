const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Permettre le chargement des fichiers de base de données SQLite (.db) comme assets
config.resolver.assetExts.push('db');

module.exports = config;
