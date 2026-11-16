import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { RequireAuth } from "./lib/auth";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Predict from "./pages/Predict";
import MapPage from "./pages/MapPage";
import DataExplorer from "./pages/DataExplorer";
import Models from "./pages/Models";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/predict" element={<Predict />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/data" element={<DataExplorer />} />
        <Route path="/models" element={<Models />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
