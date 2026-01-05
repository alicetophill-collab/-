import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  // StrictMode is removed to prevent double-invocation of WS in dev mode for clarity,
  // though in production it's fine. keeping it simple for this demo.
  <App />
);