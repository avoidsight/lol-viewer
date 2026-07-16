const { app } = require('electron');

void app.whenReady().then(() => {
  const Database = require('better-sqlite3');
  const database = new Database(':memory:');
  const result = database.prepare('SELECT ? AS value').get(42);
  database.close();
  if (result.value !== 42) throw new Error('Unexpected SQLite smoke result');
  console.log(`better-sqlite3 Electron smoke passed: value=${result.value}`);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
