'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function loginAction(formData: FormData) {
  const password = formData.get('password');
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return { error: 'Системная ошибка: ADMIN_PASSWORD не задан в окружении.' };
  }

  if (password === adminPassword) {
    // Устанавливаем HTTP-only куку на 1 неделю
    cookies().set('admin_session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, 
      path: '/',
    });
    
    redirect('/admin');
  } else {
    return { error: 'Неверный пароль' };
  }
}

export async function logoutAction() {
  cookies().delete('admin_session');
  redirect('/login');
}
