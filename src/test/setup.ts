import "@testing-library/jest-dom";
import { setLanguage } from "@/i18n";

// Tests assert Spanish copy regardless of the machine's locale
setLanguage("es");

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
