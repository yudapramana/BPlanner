// Stub react-native secukupnya agar modul lib/, komponen, dan layar bisa dimuat & dirender di Node.
// Komponen dasar menjadi elemen "host" bernama sama (View, Text, ...) sehingga bisa dicari dengan findAllByType('Text').
// SectionList dan Modal merender isinya sungguhan (bukan sekadar host) agar isi daftar/lembar bisa diuji.
// Alert.alert dicatat di __alerts; uji bisa memanggil tombolnya lewat pressAlert di tests/helpers/screen.js.
const React = require('react');
const host = name => {
  const C = React.forwardRef(({ children, ...props }, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollTo() {}, scrollToEnd() {}, scrollToLocation() {}, measureInWindow() {}, focus() {}, blur() {} }));
    return React.createElement(name, props, children);
  });
  C.displayName = name;
  return C;
};
const el = x => (x == null ? null : React.isValidElement(x) ? x : React.createElement(x));

function SectionList({ sections = [], renderItem, renderSectionHeader, ListHeaderComponent, ListEmptyComponent, ListFooterComponent, keyExtractor }) {
  const out = [el(ListHeaderComponent)];
  if (!sections.length) out.push(el(ListEmptyComponent));
  sections.forEach((section, si) => {
    out.push(React.createElement(React.Fragment, { key: 'h' + si }, renderSectionHeader ? renderSectionHeader({ section }) : null));
    (section.data || []).forEach((item, index) => {
      const k = keyExtractor ? keyExtractor(item, index) : si + '-' + index;
      out.push(React.createElement(React.Fragment, { key: 'i' + k }, renderItem({ item, index, section })));
    });
  });
  out.push(el(ListFooterComponent));
  return React.createElement('SectionList', null, ...out.map((x, i) => React.createElement(React.Fragment, { key: 'x' + i }, x)));
}
function Modal({ visible = true, children, ...props }) { return visible ? React.createElement('Modal', props, children) : null; }

const alerts = [];
module.exports = {
  __alerts: alerts,
  Alert: { alert: (title, message, buttons) => { alerts.push({ title, message, buttons: buttons || [] }); } },
  Platform: { OS: 'android', Version: 34, select: o => o.android ?? o.default },
  StyleSheet: { create: o => o, flatten: o => (Array.isArray(o) ? Object.assign({}, ...o.flat(Infinity).filter(Boolean)) : o || {}), hairlineWidth: 1, absoluteFillObject: {} },
  StatusBar: { currentHeight: 24 },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  Keyboard: { addListener: () => ({ remove() {} }), dismiss() {} },
  Dimensions: { get: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }), addEventListener: () => ({ remove() {} }) },
  LayoutAnimation: { configureNext() {}, Presets: { easeInEaseOut: {} }, easeInEaseOut() {} },
  Linking: { openSettings: async () => {}, openURL: async () => {} },
  View: host('View'), Text: host('Text'), ScrollView: host('ScrollView'), TouchableOpacity: host('TouchableOpacity'), ActivityIndicator: host('ActivityIndicator'),
  TextInput: Object.assign(host('TextInput'), { State: { currentlyFocusedInput: () => null } }),
  Image: host('Image'), Switch: host('Switch'), Pressable: host('Pressable'), TouchableWithoutFeedback: host('TouchableWithoutFeedback'), KeyboardAvoidingView: host('KeyboardAvoidingView'),
  SectionList, Modal,
};
