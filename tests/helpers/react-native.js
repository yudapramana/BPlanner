// Stub react-native secukupnya agar modul lib/ dan komponen bisa dimuat di Node.
const React = require('react');
const host = name => ({ children, ...props }) => React.createElement(name, props, children);
module.exports = {
  Alert: { alert: () => {} },
  Platform: { OS: 'android', select: o => o.android ?? o.default },
  StyleSheet: { create: o => o, flatten: o => o },
  StatusBar: { currentHeight: 24 },
  AppState: { addEventListener: () => ({ remove() {} }) },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  View: host('View'), Text: host('Text'), ScrollView: host('ScrollView'), TouchableOpacity: host('TouchableOpacity'), ActivityIndicator: host('ActivityIndicator'),
};
