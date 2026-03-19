import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { MonthYearProvider } from './context/MonthYearContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MonthYearProvider>
      <App />
    </MonthYearProvider>
  </React.StrictMode>
);
