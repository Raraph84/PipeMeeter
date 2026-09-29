import { app } from "electron";

app.whenReady().then(() => {
    console.log("Hello World");
    app.quit();
});
