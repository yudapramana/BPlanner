// Dimuat sebelum setiap file uji.
const sqlite = require('./expo-sqlite');
const fs = require('./expo-file-system');

beforeAll(async () => { await sqlite.__loadSql(); });
beforeEach(() => { fs.__reset(); });
