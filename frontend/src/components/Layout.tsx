import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../App';

interface NavItem {
  label: string;
  href: string;
}

interface LayoutProps {
  children: ReactNode;
  navItems?: NavItem[];
}

export default function Layout({ children, navItems }: LayoutProps) {
  const auth = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-primary-700 shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <span className="text-white text-xl font-bold tracking-tight">
                勤怠管理システム
              </span>
              {auth.isAdmin && (
                <span className="bg-primary-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                  管理者
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-primary-100 text-sm hidden sm:block">
                {auth.name}
              </span>
              <button
                onClick={auth.logout}
                className="text-primary-100 hover:text-white text-sm transition-colors"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ナビゲーション */}
      {navItems && navItems.length > 0 && (
        <nav className="bg-primary-600 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    location.pathname === item.href
                      ? 'text-white border-b-2 border-white'
                      : 'text-primary-100 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </nav>
      )}

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
