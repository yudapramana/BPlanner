// Pengganti `expo-sqlite` untuk pengujian: API sinkron yang sama (getAllSync, getFirstSync, runSync, execSync, withTransactionSync),
// tetapi dijalankan oleh sql.js (SQLite asli yang dikompilasi ke WASM, tanpa modul native). Jadi SQL di lib/*.js benar-benar dieksekusi.
const initSqlJs = require('sql.js');

let SQL = null;
let raw = null;

async function loadSql() { if (!SQL) SQL = await initSqlJs(); }
function resetDb() { if (raw) raw.close(); raw = new SQL.Database(); } // database kosong baru (di memori)
const rawDb = () => { if (!raw) throw new Error('Database uji belum disiapkan: panggil freshDb() dulu'); return raw; };
const clean = params => (params || []).map(v => (v === undefined ? null : v));

function query(sql, params, fn) {
  const st = rawDb().prepare(sql);
  try { const p = clean(params); if (p.length) st.bind(p); return fn(st); } finally { st.free(); }
}

const facade = {
  execSync: sql => { rawDb().exec(sql); },
  getAllSync: (sql, params) => query(sql, params, st => { const out = []; while (st.step()) out.push(st.getAsObject()); return out; }),
  getFirstSync: (sql, params) => query(sql, params, st => (st.step() ? st.getAsObject() : null)),
  runSync: (sql, params) => {
    const d = rawDb(); d.run(sql, clean(params));
    return { lastInsertRowId: d.exec('SELECT last_insert_rowid()')[0].values[0][0], changes: d.getRowsModified() };
  },
  // Sama seperti expo-sqlite: BEGIN ... COMMIT, ROLLBACK bila fn melempar error, dan transaksi bersarang gagal.
  withTransactionSync: fn => {
    const d = rawDb(); d.exec('BEGIN');
    try { fn(); d.exec('COMMIT'); } catch (e) { try { d.exec('ROLLBACK'); } catch (e2) { /* sudah dibatalkan */ } throw e;
    }
  },
};

module.exports = { openDatabaseSync: () => facade, __loadSql: loadSql, __resetDb: resetDb, __raw: rawDb };
