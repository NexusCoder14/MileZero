import { useEffect } from "react";

/** Gives every page its own browser title (tabs, history and screen readers rely on it). */
export function usePageTitle(title: string) {
  useEffect(() => { document.title = title; }, [title]);
}
