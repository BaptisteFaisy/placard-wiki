import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

// Point d'entrée du site statique : React strict, aucun backend, aucun réseau.
const container = document.getElementById('root');
if (!container) throw new Error('#root manquant dans index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
