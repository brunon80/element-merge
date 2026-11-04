import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { useGameStore } from './store/gameStore';
import './styles.css';

useGameStore.getState().initFromSave();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: registra o Service Worker SÓ em produção — SW no dev serviria módulos
// velhos (a armadilha do transform obsoleto; o QA sonda o dev server). O SW é
// o que torna o jogo instalável e jogável offline (ver public/sw.js).
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* sem SW o jogo segue jogável online; nada a fazer */
    });
  });
}
