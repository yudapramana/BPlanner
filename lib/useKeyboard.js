import { useEffect, useRef, useState, useCallback } from 'react';
import { Keyboard, TextInput, Dimensions } from 'react-native';

// Agar kolom yang sedang diisi tidak tertutup keyboard.
// - wrapRef : pasang di View pembungkus (collapsable={false}) yang menampung ScrollView
// - overlap : tinggi area pembungkus yang tertutup keyboard (pakai sebagai paddingBottom)
// - ensure  : panggil di onFocus setiap TextInput; menggulir ScrollView hingga kolom terlihat
// - onScroll: pasang di ScrollView (bersama scrollEventThrottle={16})
// reserve   : tinggi elemen tetap di bawah ScrollView yang ikut terangkat (mis. bar tombol Simpan)
export default function useKeyboard(scrollRef, reserve = 0) {
  const wrapRef = useRef(null);
  const kbTop = useRef(null);
  const scrollY = useRef(0);
  const [overlap, setOverlap] = useState(0);

  const ensure = useCallback(() => {
    setTimeout(() => {
      const st = TextInput.State;
      const input = st && st.currentlyFocusedInput ? st.currentlyFocusedInput() : null;
      if (!input || kbTop.current == null || !input.measureInWindow) return;
      input.measureInWindow((x, y, w, h) => {
        const limit = kbTop.current - reserve - 16;
        if (y + h > limit && scrollRef.current) scrollRef.current.scrollTo({ y: scrollY.current + (y + h - limit), animated: true });
      });
    }, 150);
  }, [reserve]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      const c = e.endCoordinates;
      const top = c.screenY > 0 ? c.screenY : Dimensions.get('screen').height - c.height;
      kbTop.current = top;
      if (wrapRef.current) wrapRef.current.measureInWindow((x, y, w, h) => setOverlap(Math.max(0, y + h - top)));
      ensure();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbTop.current = null; setOverlap(0); });
    return () => { show.remove(); hide.remove(); };
  }, [ensure]);

  return { wrapRef, overlap, ensure, onScroll: e => { scrollY.current = e.nativeEvent.contentOffset.y; } };
}
