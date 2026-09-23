import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { Toaster } from "./components/ui/sonner.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <ErrorBoundary>
        <App />
        <Toaster position="top-right" richColors closeButton />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>
);
