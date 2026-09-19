import React from 'react';
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react';

export const SSOCallbackPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory text-espresso p-4">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
        <h2 className="font-serif text-xl font-bold text-espresso">Completing Authentication...</h2>
        <p className="text-xs text-espresso/60">Connecting your account to Alongkar</p>
      </div>
      <AuthenticateWithRedirectCallback signInForceRedirectUrl="/" signUpForceRedirectUrl="/" />
    </div>
  );
};
