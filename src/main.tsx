import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { LegalPage } from './components/LegalPage.tsx';
import './index.css';
import { I18nProvider } from './i18n/I18nProvider.tsx';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const page = pathname === '/privacy'
  ? <LegalPage kind="privacy" />
  : pathname === '/terms'
    ? <LegalPage kind="terms" />
    : <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>{page}</I18nProvider>
  </StrictMode>,
);
