// Tiruan react-native-safe-area-context untuk Jest: inset tetap (status bar 24, navigasi 16).
const React = require('react');
const insets = { top: 24, bottom: 16, left: 0, right: 0 };
module.exports = {
  useSafeAreaInsets: () => insets,
  SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
  SafeAreaView: ({ children, ...p }) => React.createElement('View', p, children),
};
