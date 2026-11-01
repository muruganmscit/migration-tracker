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
  `flex items-center justify-center lg:justify-start gap-2.5 px-2.5 py-2 mb-0.5 rounded-md text-sm no-underline transition-colors ${
    isActive ? "bg-blue-50 text-blue-800 font-medium" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export default function App() {
  return (
    <div className="flex min-h-screen text-slate-900">
      <nav aria-label="Main" className="bg-surface border-r border-edge w-[64px] lg:w-[216px] shrink-0 p-2 lg:p-3 sticky top-0 h-screen overflow-y-auto">
        <div className="flex items-center justify-center lg:justify-start gap-2.5 h-12 mb-3 border-b border-edge -mx-2 -mt-2 lg:-mx-3 lg:-mt-3 lg:px-4">
          <span className="flex items-center justify-center shrink-0 w-7 h-7 rounded bg-blue-700 text-white">
            <LayoutGrid size={15} />
          </span>
          <div className="leading-tight hidden lg:block">
            <div className="text-sm font-semibold text-slate-900">Migration Portal</div>
          </div>
        </div>
        {NAV_ITEMS.map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} title={label} aria-label={label} className={({ isActive }) => navLinkClass(isActive)}>
            <Icon size={16} strokeWidth={1.75} className="shrink-0" />
            <span className="hidden lg:inline">{label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 min-w-0 p-4 lg:px-6 lg:py-5 max-w-[1440px] mx-auto">
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
