import { useQuery } from "@tanstack/react-query";

export interface DirectoryEntry {
  name: string;
  path: string;
  type: "directory" | "file" | "symlink";
  size: number | null;
}

export interface DirectoryContent {
  path: string;
  items: DirectoryEntry[];
}

export interface MediaFile {
  name: string;
  path: string;
  size: number | null;
}

export interface MediaGroup {
  name: string;
  path: string;
  files: MediaFile[];
}

export interface MediaContent {
  path: string;
  groups: MediaGroup[];
}

const fetchDirectoryContent = async (
  path: string,
): Promise<DirectoryContent> => {
  const params = new URLSearchParams({ path });
  const response = await fetch(`/api/browse?${params}`);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(error.error ?? response.statusText);
  }

  return response.json();
};

const fetchMediaFiles = async (path: string): Promise<MediaContent> => {
  const params = new URLSearchParams({ path });
  const response = await fetch(`/api/media?${params}`);

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(error.error ?? response.statusText);
  }

  return response.json();
};

export const useDirectoryContent = (path: string = "/") => {
  return useQuery({
    queryKey: ["directory", path],
    queryFn: () => fetchDirectoryContent(path),
    staleTime: 10_000,
    retry: false,
  });
};

export const useMediaFiles = (path: string = "/") => {
  return useQuery({
    queryKey: ["media", path],
    queryFn: () => fetchMediaFiles(path),
    staleTime: 10_000,
    retry: false,
  });
};
