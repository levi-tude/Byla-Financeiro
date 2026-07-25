import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { MonthYearProvider } from './context/MonthYearContext';
import { queryClient } from './queryClient';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { SensitiveBlurProvider } from './context/SensitiveBlurContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SensitiveBlurProvider>
          <AuthProvider>
            <ToastProvider>
              <MonthYearProvider>
                <App />
              </MonthYearProvider>
            </ToastProvider>
          </AuthProvider>
        </SensitiveBlurProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
