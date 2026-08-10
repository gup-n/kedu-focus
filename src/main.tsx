import { StrictMode } from 'react'; import { createRoot } from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom'; import { AppProvider } from './state/AppContext'; import App from './App'; import './styles.css';
import { PwaProvider } from './pwa/PwaContext';
const basename=import.meta.env.BASE_URL==='/'?undefined:import.meta.env.BASE_URL.replace(/\/$/,'');
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter basename={basename}><PwaProvider><AppProvider><App/></AppProvider></PwaProvider></BrowserRouter></StrictMode>)
