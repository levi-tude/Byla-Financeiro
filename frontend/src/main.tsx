import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { MonthYearProvider } from './context/MonthYearContext';
import { queryClient } from './queryClient';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MonthYearProvider>
        <App />
      </MonthYearProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
