import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import './index.css';
import { registerServiceWorker } from './pwa/register';
import { finishWipe } from './lib/wipe';

// A "Delete everything" from the last page load is done before anything opens the database.
void finishWipe()
  .catch((e) => console.error('could not delete everything', e))
  .finally(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>,
    ),
  );

void registerServiceWorker();
