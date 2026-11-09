import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/manrope";
import App from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles.css";
import "./marketing.css";
import "./generation.css";
import "./templates/ozil.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
