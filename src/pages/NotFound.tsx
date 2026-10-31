import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useI18n } from "@/i18n";

const NotFound = () => {
  const location = useLocation();
  const { t } = useI18n();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(220,20%,6%)] bg-grid-pattern px-4">
      <div className="w-full max-w-2xl rounded-lg border border-cyan-500/20 bg-[hsl(220,20%,8%)]/90 shadow-[0_0_40px_-10px_hsl(200,100%,50%,0.15)] p-6 sm:p-10 flex flex-col sm:flex-row items-center gap-6 sm:gap-10 text-center sm:text-left">
        <div className="flex flex-col items-center">
          <span className="text-6xl">🐛</span>
          <h1 className="font-display text-5xl font-bold text-cyan-100 tracking-[0.2em] text-glow-blue">404</h1>
        </div>
        <div className="flex flex-col gap-4 sm:border-l sm:border-cyan-500/15 sm:pl-10">
          <p className="font-mono text-xs text-red-300/70 break-all">❯ cd {location.pathname}</p>
          <p className="font-display text-lg text-cyan-100/90 tracking-wide">{t("home.notFound.title")}</p>
          <a
            href="/"
            className="self-center sm:self-start px-4 py-2 rounded-md bg-gradient-to-r from-cyan-600/80 to-blue-600/80 hover:from-cyan-500/90 hover:to-blue-500/90 border border-cyan-400/30 text-white font-display text-xs tracking-wider transition-all"
          >
            {t("home.notFound.back")}
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
