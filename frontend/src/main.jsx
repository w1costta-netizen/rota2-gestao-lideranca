import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { monitorarVersaoNova } from './lib/appUpdate';

// Recarrega sozinho quando sai uma versão nova e a aba está com a antiga.
monitorarVersaoNova();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
