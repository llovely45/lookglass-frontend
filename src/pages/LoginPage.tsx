import { useState, type FormEvent } from "react";

import { login } from "../lib/adminApi";

interface LoginPageProps {
  onAuthenticated?: () => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "登录失败，请检查 Token 后重试。";
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (token.trim().length === 0) {
      setError("必须填写 Token");
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
            <h1>管理员登录</h1>
            <p className="dashboard-header__description">
              登录后管理分栏和监控目标。
            </p>
          </div>
          <a className="text-link" href="/">
            公开状态
          </a>
        </header>

        <section className="state-card login-card" aria-labelledby="login-heading">
          <p className="state-card__eyebrow">受保护的配置</p>
          <h2 id="login-heading">使用 Token 登录</h2>
          <p>
            Token 仅用于本次登录请求，不会保存到浏览器存储。
          </p>

          <form className="admin-form" onSubmit={(event) => void submit(event)}>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <label className="form-field">
              <span>管理 Token</span>
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
                {isSubmitting ? "登录中…" : "登录"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
