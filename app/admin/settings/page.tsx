import { getSettings } from '@/app/actions/settings';
import SettingsForm from './SettingsForm';

// Server Component
export default async function SettingsPage() {
  // Получаем начальные данные из БД перед рендерингом
  const initialData = await getSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your external API tokens and core application settings.
        </p>
      </div>

      {/* Передаем данные в клиентский компонент формы */}
      <SettingsForm initialData={initialData} />
    </div>
  );
}
