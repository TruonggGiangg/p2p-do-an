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

// Force otplib and all @otplib/* sub-packages to use their CJS builds.
//
// WHY: Metro prefers the "module" field (ESM) in package.json over "main" (CJS).
// otplib v13 ESM transitively loads @noble/hashes via ESM, which defines enum-like
// objects that become read-only bindings in Hermes strict mode. This causes the
// "Cannot assign to read-only property 'NONE'" crash on Android/Hermes at startup.
//
// NOTE: `extraNodeModules` is only a fallback (used when pkg NOT found in node_modules),
// so it doesn't work here. `resolveRequest` intercepts BEFORE node_modules lookup.
const OTPLIB_CJS_MAP = {
    'otplib':                      path.resolve(__dirname, 'node_modules/otplib/dist/index.cjs'),
    '@otplib/core':                path.resolve(__dirname, 'node_modules/@otplib/core/dist/index.cjs'),
    '@otplib/hotp':                path.resolve(__dirname, 'node_modules/@otplib/hotp/dist/index.cjs'),
    '@otplib/totp':                path.resolve(__dirname, 'node_modules/@otplib/totp/dist/index.cjs'),
    '@otplib/uri':                 path.resolve(__dirname, 'node_modules/@otplib/uri/dist/index.cjs'),
    '@otplib/plugin-crypto-noble': path.resolve(__dirname, 'node_modules/@otplib/plugin-crypto-noble/dist/index.cjs'),
    '@otplib/plugin-base32-scure': path.resolve(__dirname, 'node_modules/@otplib/plugin-base32-scure/dist/index.cjs'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (OTPLIB_CJS_MAP[moduleName]) {
        return {
            filePath: OTPLIB_CJS_MAP[moduleName],
            type: 'sourceFile',
        };
    }
    // Fallback to default Metro resolution
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
