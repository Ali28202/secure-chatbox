import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/register-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'ثبت‌نام' };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">ساخت حساب کاربری</CardTitle>
        <CardDescription>
          حساب‌های ساخته‌شده از این صفحه، حساب دانشجویی هستند. حساب استادان را مدیر سامانه ایجاد
          می‌کند.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
    </Card>
  );
}
