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
  return (
    <IonApp>
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonTitle>AlcoMatcher Scanner</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="scanner-content">
          <div className="scanner-panel">
            <IonText>
              <h1>Scan Label Now</h1>
              <p>No login required. Instant compliance check first.</p>
            </IonText>
            <IonButton expand="block" size="large" color="primary">
              Open Scanner
            </IonButton>
            <IonButton expand="block" size="large" fill="outline">
              Import Photo
            </IonButton>
            <IonList inset>
              <IonItem>
                <IonLabel>Result Time Target: {"<= 5s"}</IonLabel>
              </IonItem>
              <IonItem>
                <IonLabel>Mode: Hybrid (Offline First)</IonLabel>
              </IonItem>
              <IonItem>
                <IonLabel>Sync State: Pending sync support enabled</IonLabel>
              </IonItem>
            </IonList>
          </div>
        </IonContent>
      </IonPage>
    </IonApp>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
