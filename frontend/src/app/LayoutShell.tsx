import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MonthYearPicker } from '../components/ui/MonthYearPicker';

export function LayoutShell() {
  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-auto">
        <div className="sticky top-0 z-10 flex items-center justify-end gap-4 bg-gray-100/95 px-4 py-2 border-b border-gray-200 shrink-0">
          <MonthYearPicker />
        </div>
        <div className="flex-1 p-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
