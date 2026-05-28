import { getSettings } from '@/app/actions/settings';
import { supabaseAdmin } from '@/lib/supabase/adminClient';
import SettingsForm from './SettingsForm';
import PromptCompiler from './PromptCompiler';
import PromptSelector from './PromptSelector';

export default async function SettingsPage() {
  const initialData = await getSettings();
  
  const { data: prompts } = await supabaseAdmin
    .from('prompts')
    .select('*')
    .order('id', { ascending: false });

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings & AI Compiler</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage system configurations, compile new AI prompts based on company needs, and select active evaluation profiles.
        </p>
      </div>

      <SettingsForm initialData={initialData} />
      <PromptCompiler />
      <PromptSelector prompts={prompts || []} activePromptId={initialData?.active_prompt_id} />
    </div>
  );
}
