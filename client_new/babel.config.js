module.exports = function (api) {
    api.cache(true);
    return {
        presets: [['babel-preset-expo', { unstable_transformProfile: 'hermes-v0' }]],
        plugins: [
            ['@babel/plugin-transform-class-properties', { loose: true }],
            ['@babel/plugin-transform-private-methods', { loose: true }],
            ['@babel/plugin-transform-private-property-in-object', { loose: true }],
            'react-native-reanimated/plugin',
        ],
    };
};
