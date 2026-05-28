'use server';

import { supabaseAdmin } from '@/lib/supabase/adminClient';
import { revalidatePath } from 'next/cache';

export async function compilePromptAction(companyNeeds: string) {
  try {
    if (!companyNeeds || companyNeeds.trim() === '') {
      return { success: false, message: 'Пожалуйста, введите требования компании.' };
    }

    // 1. Fetch the meta_prompt from settings
    const { data: appSettings, error: configError } = await supabaseAdmin
      .from('app_settings')
      .select('meta_prompt')
      .eq('id', 1)
      .maybeSingle();

    if (configError) throw configError;
    
    const metaPrompt = appSettings?.meta_prompt || 'You are an expert HR. Create a JSON evaluation prompt.';

    // 2. Call OpenRouter to compile the prompt
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) {
      return { success: false, message: 'OPENROUTER_API_KEY is not set.' };
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://hh-ru-api.vercel.app',
        'X-Title': 'Candidate Scoring Pipeline'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash', 
        messages: [
          { role: 'system', content: metaPrompt },
          { role: 'user', content: `Вот наши текущие бизнес-задачи и требования (Company Needs):\n${companyNeeds}\n\nСгенерируй финальный поисковый промпт для LLM, которая будет читать резюме кандидата. Требуй выдачу ТОЛЬКО в формате JSON с полями "score" (0-100) и "summary".` }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[compilePrompt] API Error:', errText);
      return { success: false, message: 'Ошибка при обращении к OpenRouter.' };
    }

    const json = await response.json();
    let generatedPrompt = json.choices[0].message.content;
    
    // Очистка от маркдауна, если LLM обернула промпт в ```
    generatedPrompt = generatedPrompt.replace(/^```[a-z]*\n/gm, '').replace(/```$/gm, '');

    // 3. Save the new prompt to the `prompts` table
    const { data: newPrompt, error: insertError } = await supabaseAdmin
      .from('prompts')
      .insert({
        company_needs: companyNeeds.trim(),
        prompt_text: generatedPrompt.trim()
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[compilePrompt] DB Insert Error:', insertError);
      return { success: false, message: 'Ошибка при сохранении промпта в БД.' };
    }

    // 4. Update app_settings to make this prompt active
    const { error: updateError } = await supabaseAdmin
      .from('app_settings')
      .update({ active_prompt_id: newPrompt.id })
      .eq('id', 1);

    if (updateError) {
      console.error('[compilePrompt] Settings Update Error:', updateError);
      return { success: false, message: 'Промпт сохранен, но не удалось сделать его активным.' };
    }

    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    
    return { success: true, message: 'Промпт успешно сгенерирован и установлен как активный!' };

  } catch (error: any) {
    console.error('[compilePromptAction] Unexpected error:', error);
    return { success: false, message: 'Внутренняя ошибка сервера.' };
  }
}

export async function setActivePromptAction(promptId: number) {
  try {
    const { error } = await supabaseAdmin
      .from('app_settings')
      .update({ active_prompt_id: promptId })
      .eq('id', 1);

    if (error) throw error;
    
    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    return { success: true, message: 'Активный промпт изменен.' };
  } catch (error: any) {
    console.error('[setActivePromptAction] Error:', error);
    return { success: false, message: 'Ошибка при смене промпта.' };
  }
}
