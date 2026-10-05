import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
// Fontes embutidas no sistema (não dependem do Google Fonts nem do que está instalado)
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
