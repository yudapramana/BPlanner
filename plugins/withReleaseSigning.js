// Config plugin: tanda tangan rilis dari variabel lingkungan (diisi GitHub Actions dari Secrets).
// Tanpa KEYSTORE_PATH, build rilis tetap memakai debug keystore (cocok untuk uji lokal; JANGAN diunggah ke Play Store).
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = config => withAppBuildGradle(config, c => {
  let g = c.modResults.contents;
  if (g.includes('KEYSTORE_PATH')) return c; // sudah dipasang (prebuild tanpa --clean)
  const before = g;
  // 1) build type release memakai signingConfig rilis bila KEYSTORE_PATH ada
  g = g.replace(/(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/, "$1signingConfig System.getenv('KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug");
  // 2) definisikan signingConfigs.release
  g = g.replace(/signingConfigs\s*\{/, `signingConfigs {
        release {
            if (System.getenv('KEYSTORE_PATH')) {
                storeFile file(System.getenv('KEYSTORE_PATH'))
                storePassword System.getenv('KEYSTORE_PASSWORD')
                keyAlias System.getenv('KEY_ALIAS')
                keyPassword System.getenv('KEY_PASSWORD')
            }
        }`);
  if (g === before || !g.includes('signingConfigs.release')) throw new Error('withReleaseSigning: struktur build.gradle tidak dikenali');
  c.modResults.contents = g;
  return c;
});