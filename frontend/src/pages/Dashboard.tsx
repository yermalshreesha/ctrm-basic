import { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import type { HealthResponse } from "../api/types";

type BackendState = "checking" | "connected" | "disconnected";

export function Dashboard() {
  const [backendState, setBackendState] = useState<BackendState>("checking");

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<HealthResponse>("/health")
      .then((health) => {
        if (!cancelled) setBackendState(health.db);
      })
      .catch(() => {
        if (!cancelled) setBackendState("disconnected");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <p>No data yet.</p>
      <p>
        Backend: <strong>{backendState}</strong>
      </p>
    </div>
  );
}
