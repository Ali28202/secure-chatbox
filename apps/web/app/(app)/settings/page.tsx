import type { Metadata } from 'next';
import { SettingsPanel } from '@/components/settings/settings-panel';

export const metadata: Metadata = {
  title: 'تنظیمات',
};

export default function SettingsPage() {
  return <SettingsPanel />;
}
