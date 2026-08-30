import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { LegalPage } from './components/LegalPage.tsx';
import './index.css';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const page = pathname === '/privacy'
  ? <LegalPage kind="privacy" />
  : pathname === '/terms'
    ? <LegalPage kind="terms" />
    : <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page}
  </StrictMode>,
);
