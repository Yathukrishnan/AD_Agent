import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import "./styles/theme.css";

// simple client-side gate: the app (onboarding + dashboard) requires sign-in
function RequireAuth({ children }: { children: JSX.Element }) {
  // sessionStorage → cleared on tab close, so every new session must sign in
  return sessionStorage.getItem("gai.auth") ? children : <Navigate to="/login" replace />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboard" element={<RequireAuth><Onboarding /></RequireAuth>} />
        <Route path="/app" element={<RequireAuth><Dashboard /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
