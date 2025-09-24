const { app, BrowserWindow } = require('electron');

console.log('App object:', typeof app);
console.log('BrowserWindow object:', typeof BrowserWindow);

if (app) {
  app.whenReady().then(() => {
    console.log('Electron app is ready!');
    app.quit();
  });
} else {
  console.log('App object is undefined - Electron not working properly');
}
