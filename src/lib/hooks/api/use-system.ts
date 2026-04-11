import { useMutation } from "@tanstack/react-query";

async function postSystemAction(action: string): Promise<void> {
  const res = await fetch(`/api/system/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
}

export function useSetDisplayMode() {
  return useMutation({
    mutationFn: () => postSystemAction("set-display-mode"),
  });
}
