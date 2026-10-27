const { contextBridge } = require("electron");
// The game reads this to know it runs as the desktop app and where the online league lives.
contextBridge.exposeInMainWorld("boxbox", { desktop: true, host: process.env.BOXBOX_HOST || "box-box.f1-box-box.workers.dev", platform: process.platform });
