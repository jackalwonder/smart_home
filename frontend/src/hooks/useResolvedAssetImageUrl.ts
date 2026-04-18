import { useEffect, useState } from "react";
import { getAccessToken } from "../auth/accessToken";
import { resolveAssetImageUrl } from "../api/pageAssetsApi";

function shouldFetchWithAccessToken(url: string) {
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return false;
  }

  try {
    return new URL(url, window.location.origin).pathname.startsWith("/api/v1/page-assets/");
  } catch {
    return false;
  }
}

export function useResolvedAssetImageUrl(value: string | null | undefined) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const resolved = resolveAssetImageUrl(value);
    if (!resolved) {
      setImageUrl(null);
      return undefined;
    }

    if (!shouldFetchWithAccessToken(resolved)) {
      setImageUrl(resolved);
      return undefined;
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      setImageUrl(null);
      return undefined;
    }

    const abortController = new AbortController();
    let objectUrl: string | null = null;

    setImageUrl(null);
    void (async () => {
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${accessToken}`);

      const response = await fetch(resolved, {
        credentials: "include",
        headers,
        signal: abortController.signal,
      });
      if (!response.ok) {
        return;
      }

      const blob = await response.blob();
      if (abortController.signal.aborted) {
        return;
      }

      objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    })().catch(() => {
      if (!abortController.signal.aborted) {
        setImageUrl(null);
      }
    });

    return () => {
      abortController.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [value]);

  return imageUrl;
}
