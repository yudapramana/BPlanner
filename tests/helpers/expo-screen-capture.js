// Tiruan expo-screen-capture untuk Jest. calls mencatat urutan panggilan; __reset() mengosongkan.
export const __state = { calls: [] };
export const __reset = () => { __state.calls = []; };
export const preventScreenCaptureAsync = async () => { __state.calls.push('prevent'); };
export const allowScreenCaptureAsync = async () => { __state.calls.push('allow'); };
