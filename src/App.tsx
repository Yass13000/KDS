import { useEffect, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from 'sonner'; // Import direct au lieu du dossier UI

import { StatusBar } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

// --- IMPORT UNIQUE DE LA PAGE ---
const KDS = lazy(() => import("./pages/KDS"));

const PageLoader = () => (
  <div className="flex-1 h-screen w-full flex items-center justify-center bg-[#0f172a]">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400"></div>
      <p className="mt-4 text-lg text-emerald-400 font-helvetica font-bold tracking-widest uppercase">
        Chargement Cuisine...
      </p>
    </div>
  </div>
);

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    // Masque la barre de statut sur les tablettes Android/iOS
    if (Capacitor.isNativePlatform()) {
      const hideSystemBars = async () => {
        try {
          await StatusBar.hide();
        } catch (e) {
          console.error("Erreur lors du masquage de la barre d'état", e);
        }
      };
      hideSystemBars();
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-screen w-full flex flex-col bg-[#0f172a] relative overflow-x-hidden font-helvetica select-none">
        
        {/* Notifications (Toaster) en thème sombre */}
        <Toaster position="top-center" richColors theme="dark" />
        
        <div className="flex-1 flex flex-col w-full relative">
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Redirection vers le KDS */}
                <Route path="/" element={<Navigate to="/kds" replace />} />
                
                {/* Route principale */}
                <Route path="/kds" element={<KDS />} />
                
                {/* Si on tape n'importe quoi (anciennement 404), on force le KDS */}
                <Route path="*" element={<Navigate to="/kds" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </div>
        
      </main>
    </QueryClientProvider>
  );
};

export default App;