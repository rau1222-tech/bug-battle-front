import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthGuard from "./components/auth/AuthGuard";
import { ROUTES } from "./routes";
import LoginPage from "./pages/LoginPage";
import SetupPage from "./pages/SetupPage";
import HomePage from "./pages/HomePage";
import PlayPage from "./pages/PlayPage";
import DecksPage from "./pages/DecksPage";
import DeckEditorPage from "./pages/DeckEditorPage";
import GachaPage from "./pages/GachaPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path={ROUTES.LOGIN} element={<LoginPage />} />

          <Route element={<AuthGuard />}>
            <Route path={ROUTES.SETUP} element={<SetupPage />} />
            <Route path={ROUTES.HOME} element={<HomePage />} />
            <Route path={ROUTES.PLAY} element={<PlayPage />} />
            <Route path={ROUTES.DECKS} element={<DecksPage />} />
            <Route path={ROUTES.DECK_NEW} element={<DeckEditorPage />} />
            <Route path={ROUTES.DECK_EDIT} element={<DeckEditorPage />} />
            <Route path={ROUTES.GACHA} element={<GachaPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
