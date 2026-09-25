import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LangProvider } from '@/context/LangContext';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { logger } from '@/utils/logger';
import App from './App';
import '@/styles/main.css';

if (import.meta.env.DEV) {
  const token = localStorage.getItem('access_token');
  const lang  = localStorage.getItem('lang')  ?? 'en';
  const theme = localStorage.getItem('theme') ?? 'dark';
  console.log(
    '%c[App] Dev startup',
    'color:#4f8ef7;font-weight:bold',
    `| lang: ${lang} | theme: ${theme} | token: ${token ? '✓' : '✗ none'}`,
  );
}

window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  logger.error('Unhandled Promise rejection', e.reason);
});
window.addEventListener('error', (e: ErrorEvent) => {
  if (e.message?.includes('ResizeObserver loop')) return;
  logger.error(`Uncaught JS error: ${e.message}`, new Error(`${e.filename} ${e.lineno}:${e.colno}`));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LangProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  </StrictMode>
);
