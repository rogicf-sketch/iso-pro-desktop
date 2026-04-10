var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main/index.ts
var import_electron3 = require("electron");

// electron/main/security.ts
var import_electron = require("electron");
var import_node_crypto = require("node:crypto");
var import_node_child_process = require("node:child_process");
var import_node_os = __toESM(require("node:os"), 1);
function readWindowsMachineGuid() {
  if (process.platform !== "win32") return "";
  try {
    const output = (0, import_node_child_process.execFileSync)("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], {
      encoding: "utf8",
      windowsHide: true
    });
    const match = output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}
function buildMachineFingerprint() {
  const machineGuid = readWindowsMachineGuid();
  if (process.platform === "win32" && !machineGuid) {
    return "";
  }
  const base = [process.platform, import_node_os.default.hostname(), machineGuid].join("|");
  return (0, import_node_crypto.createHash)("sha256").update(base).digest("hex");
}
function getMachineLabel() {
  return `${import_node_os.default.hostname()} (${process.platform})`;
}
function registerSecurityHandlers() {
  import_electron.ipcMain.handle("desktop-security:get-context", async () => ({
    isElectron: true,
    machineFingerprint: buildMachineFingerprint(),
    machineLabel: getMachineLabel(),
    appVersion: import_electron.app.getVersion()
  }));
}

// electron/main/window.ts
var import_electron2 = require("electron");
var import_node_path = __toESM(require("node:path"), 1);
var import_node_url = require("node:url");
var import_meta = {};
var __filename = (0, import_node_url.fileURLToPath)(import_meta.url);
var __dirname = import_node_path.default.dirname(__filename);
function createMainWindow() {
  const window = new import_electron2.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    webPreferences: {
      // Main bundle lives at electron/.dev-main.cjs, so preload is next to it under electron/preload/
      preload: import_node_path.default.join(__dirname, "preload", "index.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(import_node_path.default.join(__dirname, "..", "dist", "index.html"));
  }
  return window;
}

// electron/main/index.ts
function bootstrap() {
  registerSecurityHandlers();
  createMainWindow();
  import_electron3.app.on("activate", () => {
    if (import_electron3.BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}
import_electron3.app.whenReady().then(bootstrap);
import_electron3.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron3.app.quit();
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi9pbmRleC50cyIsICJtYWluL3NlY3VyaXR5LnRzIiwgIm1haW4vd2luZG93LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBhcHAsIEJyb3dzZXJXaW5kb3cgfSBmcm9tICdlbGVjdHJvbic7XHJcbmltcG9ydCB7IHJlZ2lzdGVyU2VjdXJpdHlIYW5kbGVycyB9IGZyb20gJy4vc2VjdXJpdHknO1xyXG5pbXBvcnQgeyBjcmVhdGVNYWluV2luZG93IH0gZnJvbSAnLi93aW5kb3cnO1xyXG5cclxuZnVuY3Rpb24gYm9vdHN0cmFwKCkge1xyXG4gIHJlZ2lzdGVyU2VjdXJpdHlIYW5kbGVycygpO1xyXG4gIGNyZWF0ZU1haW5XaW5kb3coKTtcclxuXHJcbiAgYXBwLm9uKCdhY3RpdmF0ZScsICgpID0+IHtcclxuICAgIGlmIChCcm93c2VyV2luZG93LmdldEFsbFdpbmRvd3MoKS5sZW5ndGggPT09IDApIHtcclxuICAgICAgY3JlYXRlTWFpbldpbmRvdygpO1xyXG4gICAgfVxyXG4gIH0pO1xyXG59XHJcblxyXG5hcHAud2hlblJlYWR5KCkudGhlbihib290c3RyYXApO1xyXG5cclxuYXBwLm9uKCd3aW5kb3ctYWxsLWNsb3NlZCcsICgpID0+IHtcclxuICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ2RhcndpbicpIHtcclxuICAgIGFwcC5xdWl0KCk7XHJcbiAgfVxyXG59KTtcclxuIiwgImltcG9ydCB7IGFwcCwgaXBjTWFpbiB9IGZyb20gJ2VsZWN0cm9uJztcclxuaW1wb3J0IHsgY3JlYXRlSGFzaCB9IGZyb20gJ25vZGU6Y3J5cHRvJztcclxuaW1wb3J0IHsgZXhlY0ZpbGVTeW5jIH0gZnJvbSAnbm9kZTpjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0IG9zIGZyb20gJ25vZGU6b3MnO1xyXG5cclxuZnVuY3Rpb24gcmVhZFdpbmRvd3NNYWNoaW5lR3VpZCgpIHtcclxuICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ3dpbjMyJykgcmV0dXJuICcnO1xyXG5cclxuICB0cnkge1xyXG4gICAgY29uc3Qgb3V0cHV0ID0gZXhlY0ZpbGVTeW5jKCdyZWcnLCBbJ3F1ZXJ5JywgJ0hLTE1cXFxcU09GVFdBUkVcXFxcTWljcm9zb2Z0XFxcXENyeXB0b2dyYXBoeScsICcvdicsICdNYWNoaW5lR3VpZCddLCB7XHJcbiAgICAgIGVuY29kaW5nOiAndXRmOCcsXHJcbiAgICAgIHdpbmRvd3NIaWRlOiB0cnVlLFxyXG4gICAgfSk7XHJcbiAgICBjb25zdCBtYXRjaCA9IG91dHB1dC5tYXRjaCgvTWFjaGluZUd1aWRcXHMrUkVHX1NaXFxzKyhbXlxcclxcbl0rKS9pKTtcclxuICAgIHJldHVybiBtYXRjaD8uWzFdPy50cmltKCkgPz8gJyc7XHJcbiAgfSBjYXRjaCB7XHJcbiAgICByZXR1cm4gJyc7XHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBidWlsZE1hY2hpbmVGaW5nZXJwcmludCgpIHtcclxuICBjb25zdCBtYWNoaW5lR3VpZCA9IHJlYWRXaW5kb3dzTWFjaGluZUd1aWQoKTtcclxuICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyAmJiAhbWFjaGluZUd1aWQpIHtcclxuICAgIHJldHVybiAnJztcclxuICB9XHJcblxyXG4gIGNvbnN0IGJhc2UgPSBbcHJvY2Vzcy5wbGF0Zm9ybSwgb3MuaG9zdG5hbWUoKSwgbWFjaGluZUd1aWRdLmpvaW4oJ3wnKTtcclxuICByZXR1cm4gY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGJhc2UpLmRpZ2VzdCgnaGV4Jyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldE1hY2hpbmVMYWJlbCgpIHtcclxuICByZXR1cm4gYCR7b3MuaG9zdG5hbWUoKX0gKCR7cHJvY2Vzcy5wbGF0Zm9ybX0pYDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyU2VjdXJpdHlIYW5kbGVycygpIHtcclxuICBpcGNNYWluLmhhbmRsZSgnZGVza3RvcC1zZWN1cml0eTpnZXQtY29udGV4dCcsIGFzeW5jICgpID0+ICh7XHJcbiAgICBpc0VsZWN0cm9uOiB0cnVlLFxyXG4gICAgbWFjaGluZUZpbmdlcnByaW50OiBidWlsZE1hY2hpbmVGaW5nZXJwcmludCgpLFxyXG4gICAgbWFjaGluZUxhYmVsOiBnZXRNYWNoaW5lTGFiZWwoKSxcclxuICAgIGFwcFZlcnNpb246IGFwcC5nZXRWZXJzaW9uKCksXHJcbiAgfSkpO1xyXG59XHJcbiIsICJpbXBvcnQgeyBCcm93c2VyV2luZG93IH0gZnJvbSAnZWxlY3Ryb24nO1xyXG5pbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xyXG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAnbm9kZTp1cmwnO1xyXG5cclxuY29uc3QgX19maWxlbmFtZSA9IGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKTtcclxuY29uc3QgX19kaXJuYW1lID0gcGF0aC5kaXJuYW1lKF9fZmlsZW5hbWUpO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1haW5XaW5kb3coKSB7XHJcbiAgY29uc3Qgd2luZG93ID0gbmV3IEJyb3dzZXJXaW5kb3coe1xyXG4gICAgd2lkdGg6IDE0NDAsXHJcbiAgICBoZWlnaHQ6IDkwMCxcclxuICAgIG1pbldpZHRoOiAxMjAwLFxyXG4gICAgbWluSGVpZ2h0OiA3NjAsXHJcbiAgICBiYWNrZ3JvdW5kQ29sb3I6ICcjMGYxNzJhJyxcclxuICAgIGF1dG9IaWRlTWVudUJhcjogdHJ1ZSxcclxuICAgIHdlYlByZWZlcmVuY2VzOiB7XHJcbiAgICAgIC8vIE1haW4gYnVuZGxlIGxpdmVzIGF0IGVsZWN0cm9uLy5kZXYtbWFpbi5janMsIHNvIHByZWxvYWQgaXMgbmV4dCB0byBpdCB1bmRlciBlbGVjdHJvbi9wcmVsb2FkL1xyXG4gICAgICBwcmVsb2FkOiBwYXRoLmpvaW4oX19kaXJuYW1lLCAncHJlbG9hZCcsICdpbmRleC5tanMnKSxcclxuICAgICAgY29udGV4dElzb2xhdGlvbjogdHJ1ZSxcclxuICAgICAgbm9kZUludGVncmF0aW9uOiBmYWxzZSxcclxuICAgIH0sXHJcbiAgfSk7XHJcblxyXG4gIGNvbnN0IGRldlNlcnZlclVybCA9IHByb2Nlc3MuZW52LlZJVEVfREVWX1NFUlZFUl9VUkw7XHJcblxyXG4gIGlmIChkZXZTZXJ2ZXJVcmwpIHtcclxuICAgIHZvaWQgd2luZG93LmxvYWRVUkwoZGV2U2VydmVyVXJsKTtcclxuICB9IGVsc2Uge1xyXG4gICAgdm9pZCB3aW5kb3cubG9hZEZpbGUocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uJywgJ2Rpc3QnLCAnaW5kZXguaHRtbCcpKTtcclxuICB9XHJcblxyXG4gIHJldHVybiB3aW5kb3c7XHJcbn1cclxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsSUFBQUEsbUJBQW1DOzs7QUNBbkMsc0JBQTZCO0FBQzdCLHlCQUEyQjtBQUMzQixnQ0FBNkI7QUFDN0IscUJBQWU7QUFFZixTQUFTLHlCQUF5QjtBQUNoQyxNQUFJLFFBQVEsYUFBYSxRQUFTLFFBQU87QUFFekMsTUFBSTtBQUNGLFVBQU0sYUFBUyx3Q0FBYSxPQUFPLENBQUMsU0FBUywyQ0FBMkMsTUFBTSxhQUFhLEdBQUc7QUFBQSxNQUM1RyxVQUFVO0FBQUEsTUFDVixhQUFhO0FBQUEsSUFDZixDQUFDO0FBQ0QsVUFBTSxRQUFRLE9BQU8sTUFBTSxvQ0FBb0M7QUFDL0QsV0FBTyxRQUFRLENBQUMsR0FBRyxLQUFLLEtBQUs7QUFBQSxFQUMvQixRQUFRO0FBQ04sV0FBTztBQUFBLEVBQ1Q7QUFDRjtBQUVBLFNBQVMsMEJBQTBCO0FBQ2pDLFFBQU0sY0FBYyx1QkFBdUI7QUFDM0MsTUFBSSxRQUFRLGFBQWEsV0FBVyxDQUFDLGFBQWE7QUFDaEQsV0FBTztBQUFBLEVBQ1Q7QUFFQSxRQUFNLE9BQU8sQ0FBQyxRQUFRLFVBQVUsZUFBQUMsUUFBRyxTQUFTLEdBQUcsV0FBVyxFQUFFLEtBQUssR0FBRztBQUNwRSxhQUFPLCtCQUFXLFFBQVEsRUFBRSxPQUFPLElBQUksRUFBRSxPQUFPLEtBQUs7QUFDdkQ7QUFFQSxTQUFTLGtCQUFrQjtBQUN6QixTQUFPLEdBQUcsZUFBQUEsUUFBRyxTQUFTLENBQUMsS0FBSyxRQUFRLFFBQVE7QUFDOUM7QUFFTyxTQUFTLDJCQUEyQjtBQUN6QywwQkFBUSxPQUFPLGdDQUFnQyxhQUFhO0FBQUEsSUFDMUQsWUFBWTtBQUFBLElBQ1osb0JBQW9CLHdCQUF3QjtBQUFBLElBQzVDLGNBQWMsZ0JBQWdCO0FBQUEsSUFDOUIsWUFBWSxvQkFBSSxXQUFXO0FBQUEsRUFDN0IsRUFBRTtBQUNKOzs7QUN6Q0EsSUFBQUMsbUJBQThCO0FBQzlCLHVCQUFpQjtBQUNqQixzQkFBOEI7QUFGOUI7QUFJQSxJQUFNLGlCQUFhLCtCQUFjLFlBQVksR0FBRztBQUNoRCxJQUFNLFlBQVksaUJBQUFDLFFBQUssUUFBUSxVQUFVO0FBRWxDLFNBQVMsbUJBQW1CO0FBQ2pDLFFBQU0sU0FBUyxJQUFJLCtCQUFjO0FBQUEsSUFDL0IsT0FBTztBQUFBLElBQ1AsUUFBUTtBQUFBLElBQ1IsVUFBVTtBQUFBLElBQ1YsV0FBVztBQUFBLElBQ1gsaUJBQWlCO0FBQUEsSUFDakIsaUJBQWlCO0FBQUEsSUFDakIsZ0JBQWdCO0FBQUE7QUFBQSxNQUVkLFNBQVMsaUJBQUFBLFFBQUssS0FBSyxXQUFXLFdBQVcsV0FBVztBQUFBLE1BQ3BELGtCQUFrQjtBQUFBLE1BQ2xCLGlCQUFpQjtBQUFBLElBQ25CO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxlQUFlLFFBQVEsSUFBSTtBQUVqQyxNQUFJLGNBQWM7QUFDaEIsU0FBSyxPQUFPLFFBQVEsWUFBWTtBQUFBLEVBQ2xDLE9BQU87QUFDTCxTQUFLLE9BQU8sU0FBUyxpQkFBQUEsUUFBSyxLQUFLLFdBQVcsTUFBTSxRQUFRLFlBQVksQ0FBQztBQUFBLEVBQ3ZFO0FBRUEsU0FBTztBQUNUOzs7QUY1QkEsU0FBUyxZQUFZO0FBQ25CLDJCQUF5QjtBQUN6QixtQkFBaUI7QUFFakIsdUJBQUksR0FBRyxZQUFZLE1BQU07QUFDdkIsUUFBSSwrQkFBYyxjQUFjLEVBQUUsV0FBVyxHQUFHO0FBQzlDLHVCQUFpQjtBQUFBLElBQ25CO0FBQUEsRUFDRixDQUFDO0FBQ0g7QUFFQSxxQkFBSSxVQUFVLEVBQUUsS0FBSyxTQUFTO0FBRTlCLHFCQUFJLEdBQUcscUJBQXFCLE1BQU07QUFDaEMsTUFBSSxRQUFRLGFBQWEsVUFBVTtBQUNqQyx5QkFBSSxLQUFLO0FBQUEsRUFDWDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImltcG9ydF9lbGVjdHJvbiIsICJvcyIsICJpbXBvcnRfZWxlY3Ryb24iLCAicGF0aCJdCn0K
