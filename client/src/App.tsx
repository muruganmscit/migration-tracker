import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { LayoutDashboard, Building2, Mail, LayoutGrid } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Applications from "./pages/Applications";
import ApplicationDetail from "./pages/ApplicationDetail";
import EmailTemplatesPage from "./pages/EmailTemplates";

const NAV_ITEMS = [
  { to: "/", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/applications", end: false, label: "Applications", icon: Building2 },
  { to: "/email-templates", end: false, label: "Email Templates", icon: Mail },
];

const navLinkClass = (isActive: boolean) =>
  `flex items-center justify-center lg:justify-start gap-3 px-3 lg:px-3.5 py-2.5 mb-1 rounded-xl text-sm no-underline transition ${
    isActive
      ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-medium shadow-md shadow-indigo-500/30"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export default function App() {
  return (
    <div className={"flex min-h-screen text-slate-900"}>
      <nav aria-label="Main" className="panel w-[76px] lg:w-[240px] shrink-0 m-4 mr-0 p-3 lg:p-5 rounded-3xl sticky top-4 h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-center lg:justify-start gap-2.5 mb-8 lg:px-1">
          <span className="flex items-center justify-center shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
            <LayoutGrid size={18} />
          </span>
          <div className="leading-tight hidden lg:block">
            <div className="text-sm font-bold text-slate-900 tracking-tight">Migration Portal</div>
            <div className="text-[11px] text-slate-500">Harness migration tracker</div>
          </div>
        </div>
                {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} title={label} aria-label={label} className={({ isActive }) => navLinkClass(isActive)}>
            <Icon size={18} strokeWidth={2} className="shrink-0" />
            <span className="hidden lg:inline">{label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 min-w-0 p-4 lg:p-8 max-w-[1400px] mx-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/applications/:id" element={<ApplicationDetail />} />
          {/* Reports is hidden for now. To restore it, render pages/Reports here and add it to NAV_ITEMS. */}
          <Route path="/reports" element={<Navigate to="/" replace />} />
          <Route path="/email-templates" element={<EmailTemplatesPage />} />
        </Routes>
      </main>
    </div>
  );
}
