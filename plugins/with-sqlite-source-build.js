const { withGradleProperties } = require('expo/config-plugins');

/**
 * The SDK 58.0.15 published SQLite AAR calls an Expo Modules v2 API that is
 * absent from the SDK 58 runtime selected by this app. Explicitly preserving
 * SQLite's default FTS support makes autolinking select the source project,
 * so SQLite is compiled against the same runtime as the app.
 */
function withSQLiteSourceBuild(config) {
  return withGradleProperties(config, (mod) => {
    const propertyName = 'expo.sqlite.enableFTS';
    const existing = mod.modResults.find(
      (property) => property.type === 'property' && property.key === propertyName
    );

    if (existing) {
      existing.value = 'true';
    } else {
      mod.modResults.push({
        type: 'property',
        key: propertyName,
        value: 'true',
      });
    }

    return mod;
  });
}

module.exports = withSQLiteSourceBuild;
