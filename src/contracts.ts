export type MonitorKind = "http_get" | "tcping";

export type CheckStatus = "ok" | "http_error" | "timeout" | "error";

export interface StatusSample {
  t: number;
  s: CheckStatus | "missing";
  v: number | null;
  code?: number;
}

export interface StatusSnapshot {
  generatedAt: number;
  expiresAt: number;
  intervalSeconds: 1800;
  panels: Array<{
    id: string;
    name: string;
    logoUrl: string | null;
    monitors: Array<{
      id: string;
      name: string;
      logoUrl: string | null;
      kind: MonitorKind;
      target: string;
      samples: StatusSample[];
    }>;
  }>;
}
