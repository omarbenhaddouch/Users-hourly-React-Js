import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import OperatorApp from "./operator/App";
import DashboardApp from "./dashboard/App";
import AdminApp from "./admin/App";

// Create React App only serves a single index.html, so the 3 "pages" you
// had as separate HTML files (index.html / dashboard.html / admin.html)
// are now client-side routes instead. Firebase, state, and CSS per page
// are completely unaffected — only how you navigate between them changed.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<OperatorApp />} />
        <Route path="/dashboard" element={<DashboardApp />} />
        <Route path="/admin" element={<AdminApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
