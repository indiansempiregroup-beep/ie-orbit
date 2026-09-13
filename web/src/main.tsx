import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { AppProviders } from './providers/AppProviders';
import { captureSignedOut, captureWebSessionHandoff } from './lib/sessionHandoff';

captureWebSessionHandoff();
captureSignedOut();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>,
);
