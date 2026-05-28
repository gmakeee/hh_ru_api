import Link from 'next/link';
import { logoutAction } from '@/app/actions/auth';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col md:flex-row font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-zinc-900 border-r border-zinc-800 p-6 flex flex-col justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white mb-8 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            Scoring Admin
          </h1>
          <nav className="space-y-1.5">
            <Link 
              href="/admin" 
              className="block px-4 py-2.5 rounded-lg text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-all text-sm font-medium"
            >
              Dashboard
            </Link>
            <Link 
              href="/admin/settings" 
              className="block px-4 py-2.5 rounded-lg text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-all text-sm font-medium"
            >
              Settings
            </Link>
            <Link 
              href="/admin/logs" 
              className="block px-4 py-2.5 rounded-lg text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-all text-sm font-medium"
            >
              System Logs
            </Link>
          </nav>
        </div>

        {/* Logout Form using Server Action */}
        <div className="mt-8 md:mt-0 pt-6 border-t border-zinc-800">
          <form action={logoutAction}>
            <button 
              type="submit" 
              className="w-full flex items-center justify-center px-4 py-2 border border-zinc-800 rounded-lg shadow-sm text-sm font-medium text-zinc-400 bg-zinc-950 hover:bg-red-950/30 hover:text-red-400 hover:border-red-900/50 transition-all"
            >
              Logout
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
