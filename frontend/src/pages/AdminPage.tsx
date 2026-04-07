import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { usersApi } from '../api/client';
import type { User } from '../types';

const NAV_ITEMS = [
  { label: 'ユーザー管理', href: '/admin' },
];

export default function AdminPage() {
  return (
    <Layout navItems={NAV_ITEMS}>
      <Routes>
        <Route index element={<UserManagement />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Layout>
  );
}

function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await usersApi.list();
      setUsers(data.users.sort((a, b) => a.name.localeCompare(b.name, 'ja')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ユーザーの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function handleDelete(user: User) {
    if (!confirm(`${user.name} を削除しますか？この操作は元に戻せません。`)) return;
    setDeleting(user.userId);
    try {
      await usersApi.delete(user.userId);
      setUsers((prev) => prev.filter((u) => u.userId !== user.userId));
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ユーザー管理</h1>
          <p className="text-gray-500 text-sm mt-1">システムユーザーの追加・削除を行います</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + ユーザーを追加
        </button>
      </div>

      {showForm && (
        <CreateUserForm
          onCreated={() => { setShowForm(false); loadUsers(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">ユーザーが登録されていません</p>
            <p className="text-sm mt-1">上のボタンからユーザーを追加してください</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">名前</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">メールアドレス</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">役割</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-600">登録日</th>
                <th className="px-6 py-3 text-right font-semibold text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.userId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{user.name}</td>
                  <td className="px-6 py-4 text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={user.role === 'admin'
                      ? 'badge-present'
                      : 'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700'
                    }>
                      {user.role === 'admin' ? '管理者' : '利用者'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(user)}
                      disabled={deleting === user.userId}
                      className="btn-danger text-xs py-1 px-3"
                    >
                      {deleting === user.userId ? '削除中...' : '削除'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface CreateUserFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

function CreateUserForm({ onCreated, onCancel }: CreateUserFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await usersApi.create({ name, email, role, temporaryPassword });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ユーザーの作成に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card border-primary-200 bg-primary-50">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">新規ユーザー追加</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">氏名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="山田 太郎"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="taro@company.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">役割 *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'user')}
              className="input"
            >
              <option value="user">利用者</option>
              <option value="admin">管理者</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード *</label>
            <input
              type="text"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              className="input"
              placeholder="初期パスワード（8文字以上、英大小文字・数字含む）"
              required
              minLength={8}
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="btn-secondary">
            キャンセル
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? '作成中...' : 'ユーザーを作成'}
          </button>
        </div>
      </form>
    </div>
  );
}
