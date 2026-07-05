import { useEffect } from "react";

export function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (vv) {
      const set = () => {
        document.documentElement.style.setProperty(
          "--vh",
          `${vv.height}px`
        );
      };
      set();
      vv.addEventListener("resize", set);
      return () => vv.removeEventListener("resize", set);
    }
  }, []);
}
