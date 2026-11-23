// Config plugin: APK/AAB rilis lebih kecil.
//  - reactNativeArchitectures: hanya ARM (HP Android nyata). x86/x86_64 (emulator PC) dibuang, ukuran native lib kira-kira separuh.
//  - R8 (minify) + shrink resources untuk build rilis. Properti ini memang dibaca template build.gradle bawaan Expo.
// Setelah build pertama dengan plugin ini, uji di HP: masuk Google, sinkron Drive, notifikasi, ekspor Excel/CSV, kunci aplikasi.
// Bila ada yang rusak karena R8, hapus baris "./plugins/withLeanRelease" dari app.json (plugins) lalu build ulang.
const { withGradleProperties } = require('expo/config-plugins');

const set = (props, key, value) => {
  const i = props.findIndex(p => p.type === 'property' && p.key === key);
  if (i >= 0) props[i].value = value; else props.push({ type: 'property', key, value });
};

module.exports = config => withGradleProperties(config, c => {
  set(c.modResults, 'reactNativeArchitectures', 'armeabi-v7a,arm64-v8a');
  set(c.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
  set(c.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
  return c;
});