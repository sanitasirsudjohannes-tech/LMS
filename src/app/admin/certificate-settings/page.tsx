import { redirect } from 'next/navigation';

export default function LegacyCertificateSettingsPage() {
  redirect('/admin/certificate-training');
}
