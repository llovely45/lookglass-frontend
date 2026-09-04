import { useState, type FormEvent } from "react";

import { login } from "../lib/adminApi";

interface LoginPageProps {
  onAuthenticated?: () => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Sign in failed. Check the token and try again.";
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (token.trim().length === 0) {
      setError("Token is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(token);
      setToken("");
      onAuthenticated?.();
    } catch (caughtError) {
      setError(errorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <div className="page-container admin-page">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Lookglass</p>
            <h1>Admin sign in</h1>
            <p className="dashboard-header__description">
              Authenticate to manage panels and monitors.
            </p>
          </div>
          <a className="text-link" href="/">
            Public status
          </a>
        </header>

        <section className="state-card login-card" aria-labelledby="login-heading">
          <p className="state-card__eyebrow">Protected configuration</p>
          <h2 id="login-heading">Sign in with your token</h2>
          <p>
            The token is used for this sign-in request only and is kept out of browser
            storage.
          </p>

          <form className="admin-form" onSubmit={(event) => void submit(event)}>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <label className="form-field">
              <span>Token</span>
              <input
                autoComplete="current-password"
                name="token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                spellCheck={false}
              />
            </label>

            <div className="form-actions">
              <button
                className="button button--primary"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
