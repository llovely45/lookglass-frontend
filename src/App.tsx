import * as React from "react";

import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import {
  getSession,
  getSessionState,
  subscribeSession,
  type AdminSession,
} from "./lib/adminApi";

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname === "/admin/";
}

function AdminLoading() {
  return (
    <main className="dashboard-shell">
      <div className="page-container">
        <section className="state-card" role="status" aria-live="polite">
          <span className="loading-indicator" aria-hidden="true" />
          <h1>Checking session</h1>
          <p>Verifying the administrator session with the Worker.</p>
        </section>
      </div>
    </main>
  );
}

function AdminRoute() {
  const [initialSession] = React.useState<AdminSession | null>(() =>
    getSessionState(),
  );
  const [session, setSession] = React.useState<AdminSession | null>(initialSession);
  const [isChecking, setIsChecking] = React.useState(initialSession === null);

  React.useEffect(() => {
    const unsubscribe = subscribeSession(setSession);
    if (initialSession) {
      setIsChecking(false);
      return unsubscribe;
    }

    let active = true;
    void getSession()
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setIsChecking(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [initialSession]);

  if (isChecking) {
    return <AdminLoading />;
  }

  if (!session) {
    return (
      <LoginPage
        onAuthenticated={() =>
          setSession(getSessionState() ?? { authenticated: true })
        }
      />
    );
  }

  return <AdminPage onUnauthenticated={() => setSession(null)} />;
}

export default function App() {
  return isAdminPath(window.location.pathname) ? <AdminRoute /> : <DashboardPage />;
}
