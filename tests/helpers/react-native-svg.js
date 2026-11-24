// Tiruan react-native-svg untuk Jest: setiap bentuk menjadi elemen host bernama sama (Svg, Path, Circle, ...).
const React = require('react');
const host = name => { const C = ({ children, ...p }) => React.createElement(name, p, children); C.displayName = name; return C; };
const names = ['Svg', 'Path', 'Circle', 'Rect', 'G', 'Line', 'Text', 'Defs', 'LinearGradient', 'Stop', 'Polyline', 'Polygon', 'Ellipse'];
const m = Object.fromEntries(names.map(n => [n, host(n === 'Text' ? 'SvgText' : n)]));
module.exports = { __esModule: true, default: m.Svg, ...m };
