import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { createRoot } from "react-dom/client";
import { setupIonicReact } from "@ionic/react";
import { IonApp, IonContent, IonHeader, IonPage, IonText, IonTitle, IonToolbar, IonButton, IonItem, IonLabel, IonList } from "@ionic/react";
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "./styles.css";
setupIonicReact();
function App() {
    return (_jsx(IonApp, { children: _jsxs(IonPage, { children: [_jsx(IonHeader, { children: _jsx(IonToolbar, { children: _jsx(IonTitle, { children: "AlcoMatcher Scanner" }) }) }), _jsx(IonContent, { className: "scanner-content", children: _jsxs("div", { className: "scanner-panel", children: [_jsxs(IonText, { children: [_jsx("h1", { children: "Scan Label Now" }), _jsx("p", { children: "No login required. Instant compliance check first." })] }), _jsx(IonButton, { expand: "block", size: "large", color: "primary", children: "Open Scanner" }), _jsx(IonButton, { expand: "block", size: "large", fill: "outline", children: "Import Photo" }), _jsxs(IonList, { inset: true, children: [_jsx(IonItem, { children: _jsxs(IonLabel, { children: ["Result Time Target: ", "<= 5s"] }) }), _jsx(IonItem, { children: _jsx(IonLabel, { children: "Mode: Hybrid (Offline First)" }) }), _jsx(IonItem, { children: _jsx(IonLabel, { children: "Sync State: Pending sync support enabled" }) })] })] }) })] }) }));
}
const root = document.getElementById("root");
if (!root)
    throw new Error("Root element not found");
createRoot(root).render(_jsx(React.StrictMode, { children: _jsx(App, {}) }));
