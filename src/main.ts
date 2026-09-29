const { app } = require("electron");

app.whenReady().then(() => {
    console.log("Hello World");
    app.quit();
});
