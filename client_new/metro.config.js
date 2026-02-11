const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add support for .cjs and .mjs extensions
config.resolver.sourceExts.push('cjs', 'mjs');

// Ensure all packages can resolve modules from the project root node_modules
// This fixes the issue where react-native-reanimated can't find react-native-worklets
config.resolver.nodeModulesPaths = [
    path.resolve(__dirname, 'node_modules'),
];

module.exports = config;
