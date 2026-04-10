import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface PlayerStatus {
  playing: boolean;
  paused?: boolean;
  title?: string | null;
  position?: number | null;
  duration?: number | null;
  volume?: number | null;
  fullscreen?: boolean;
}

async function fetchPlayerStatus(): Promise<PlayerStatus> {
  const res = await fetch("/api/player/status");
  if (!res.ok) throw new Error("Failed to fetch player status");
  return res.json();
}

async function postPlayerAction(action: string, body?: object): Promise<void> {
  const res = await fetch(`/api/player/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
}

export const PLAYER_STATUS_KEY = ["player", "status"];

export function usePlayerStatus() {
  return useQuery({
    queryKey: PLAYER_STATUS_KEY,
    queryFn: fetchPlayerStatus,
    refetchInterval: (query) => {
      return query.state.data?.playing ? 1000 : 3000;
    },
    staleTime: 0,
  });
}

export function usePlayFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (filePath: string) =>
      postPlayerAction("play", { path: filePath }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLAYER_STATUS_KEY });
    },
  });
}

export function usePausePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => postPlayerAction("pause"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: PLAYER_STATUS_KEY });
      queryClient.setQueryData<PlayerStatus>(PLAYER_STATUS_KEY, (old) =>
        old ? { ...old, paused: true } : old,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PLAYER_STATUS_KEY });
    },
  });
}

export function useResumePlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => postPlayerAction("resume"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: PLAYER_STATUS_KEY });
      queryClient.setQueryData<PlayerStatus>(PLAYER_STATUS_KEY, (old) =>
        old ? { ...old, paused: false } : old,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PLAYER_STATUS_KEY });
    },
  });
}

export function useStopPlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => postPlayerAction("stop"),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: PLAYER_STATUS_KEY });
      queryClient.setQueryData<PlayerStatus>(PLAYER_STATUS_KEY, {
        playing: false,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PLAYER_STATUS_KEY });
    },
  });
}

export function useSeekPlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (position: number) => postPlayerAction("seek", { position }),
    onMutate: async (position) => {
      await queryClient.cancelQueries({ queryKey: PLAYER_STATUS_KEY });
      queryClient.setQueryData<PlayerStatus>(PLAYER_STATUS_KEY, (old) =>
        old ? { ...old, position } : old,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PLAYER_STATUS_KEY });
    },
  });
}

export function useSetVolume() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (volume: number) => postPlayerAction("volume", { volume }),
    onMutate: async (volume) => {
      await queryClient.cancelQueries({ queryKey: PLAYER_STATUS_KEY });
      queryClient.setQueryData<PlayerStatus>(PLAYER_STATUS_KEY, (old) =>
        old ? { ...old, volume } : old,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PLAYER_STATUS_KEY });
    },
  });
}

export function useSetFullscreen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fullscreen: boolean) =>
      postPlayerAction("fullscreen", { fullscreen }),
    onMutate: async (fullscreen) => {
      await queryClient.cancelQueries({ queryKey: PLAYER_STATUS_KEY });
      queryClient.setQueryData<PlayerStatus>(PLAYER_STATUS_KEY, (old) =>
        old ? { ...old, fullscreen } : old,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PLAYER_STATUS_KEY });
    },
  });
}
