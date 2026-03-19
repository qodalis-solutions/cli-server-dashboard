import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@xterm/xterm/css/xterm.css';
import '@qodalis/cli/assets/cli-panel.css';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/qcli/admin">
      <App />
    </BrowserRouter>
  </StrictMode>,
);
