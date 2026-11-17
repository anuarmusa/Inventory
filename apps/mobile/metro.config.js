// Expo configures Metro for the pnpm workspace automatically; this only adds .sql for Drizzle migrations.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');

module.exports = config;
