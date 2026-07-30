
import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/screens/settings/SettingsPage';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});
