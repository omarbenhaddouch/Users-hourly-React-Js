import { useEffect } from "react";

/**
 * Loads a page-specific stylesheet as a real <link> tag while the page
 * is mounted, and removes it on unmount.
 *
 * Why: each page (operator/dashboard/admin) defines its own :root, *, and
 * body rules with the same variable names but different values. With a
 * normal `import "./page.css"` in a single-page CRA app, webpack bundles
 * all three permanently and they'd fight each other when you switch routes.
 * Loading the CSS as an actual stylesheet — added on mount, removed on
 * unmount — keeps each page's styling fully isolated, the same way it was
 * when each page was its own separate HTML file.
 */
export default function usePageStylesheet(href) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-page-stylesheet", href);
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, [href]);
}
