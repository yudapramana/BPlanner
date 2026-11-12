// Sistem file palsu di memori (API class File / Directory / Paths milik expo-file-system SDK 58 yang dipakai lib/files.js).
const store = new Map(); // uri -> isi teks
const state = { failWrites: false };

class Dir {
  constructor(...parts) { this.uri = parts.map(p => (typeof p === 'string' ? p : p.uri)).join('/').replace(/\/+/g, '/'); }
  get exists() { return store.has(this.uri + '/'); }
  create() { store.set(this.uri + '/', ''); }
  list() { return [...store.keys()].filter(k => k.startsWith(this.uri + '/') && k !== this.uri + '/').map(k => new FileC(k)); }
}
class FileC {
  constructor(...parts) { this.uri = parts.map(p => (typeof p === 'string' ? p : p.uri)).join('/').replace(/\/+/g, '/'); }
  get name() { return this.uri.split('/').pop(); }
  get exists() { return store.has(this.uri); }
  create() { store.set(this.uri, ''); }
  async write(content) { if (state.failWrites) throw new Error('Penyimpanan penuh (simulasi)'); store.set(this.uri, String(content)); }
  async text() { if (!store.has(this.uri)) throw new Error('File tidak ada: ' + this.uri); return store.get(this.uri); }
  delete() { store.delete(this.uri); }
}
module.exports = {
  File: FileC, Directory: Dir,
  Paths: { cache: new Dir('file:///cache'), document: new Dir('file:///document') },
  __store: store, __state: state,
  __reset: () => { store.clear(); state.failWrites = false; },
};
