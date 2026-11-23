// Tiruan expo-local-authentication untuk Jest. Atur perilaku lewat __state, kembalikan ke awal dengan __reset().
export const SecurityLevel = { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 };
export const __state = { level: 1, result: { success: true }, throws: null, calls: [], onAuth: null };
export const __reset = () => { __state.level = 1; __state.result = { success: true }; __state.throws = null; __state.calls = []; __state.onAuth = null; };
export const getEnrolledLevelAsync = async () => { if (__state.throws === 'level') throw new Error('level gagal'); return __state.level; };
export const authenticateAsync = async opts => {
  __state.calls.push(opts);
  if (__state.onAuth) __state.onAuth();
  if (__state.throws === 'auth') throw new Error('auth gagal');
  return __state.result;
};