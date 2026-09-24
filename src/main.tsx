import { ClerkProvider } from '@clerk/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        {PUBLISHABLE_KEY ? (
          <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
            <App />
          </ClerkProvider>
        ) : (
          <div className="min-h-screen flex items-center justify-center bg-ivory text-espresso px-4 py-12">
            <div className="max-w-md w-full text-center space-y-5 bg-white p-8 rounded-2xl shadow-xl border border-gold/30">
              <div className="w-14 h-14 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                !
              </div>
              <div className="space-y-2">
                <h2 className="font-serif text-2xl font-bold text-espresso">
                  Configuration Required
                </h2>
                <p className="text-sm text-espresso/75">
                  Missing Clerk Publishable Key in environment variables.
                </p>
              </div>
              <div className="p-3 bg-espresso/5 rounded-lg text-left text-xs font-mono text-espresso/80">
                Key: VITE_CLERK_PUBLISHABLE_KEY
              </div>
              <p className="text-xs text-espresso/60 leading-relaxed">
                Add <strong>VITE_CLERK_PUBLISHABLE_KEY</strong> to your Vercel Project Settings &rarr; Environment Variables, then redeploy the project.
              </p>
            </div>
          </div>
        )}
      </ErrorBoundary>
    </StrictMode>,
  );
}