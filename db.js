import * as SQLite from 'expo-sqlite';
import { SEED_CATS, SEED_TX } from './seed';
export const db = SQLite.openDatabaseSync('budget.db');

export function initDb() {
  db.execSync(`CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT, jenis TEXT NOT NULL, nama TEXT NOT NULL, anggaran INTEGER NOT NULL DEFAULT 0, urut INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY AUTOINCREMENT, tanggal TEXT, jenis TEXT, kategori TEXT, nominal INTEGER, ket TEXT);`);
  const n = db.getFirstSync('SELECT COUNT(*) c FROM categories').c;
  if (n === 0) seedAll();
}
export function seedAll() {
  db.execSync('DELETE FROM categories; DELETE FROM transactions;');
  Object.entries(SEED_CATS).forEach(([j, arr]) =>
    arr.forEach(([nama, a], i) => db.runSync('INSERT INTO categories(jenis,nama,anggaran,urut) VALUES(?,?,?,?)', [j, nama, a, i])));
  SEED_TX.forEach(t => db.runSync('INSERT INTO transactions(tanggal,jenis,kategori,nominal,ket) VALUES(?,?,?,?,?)', t));
}
