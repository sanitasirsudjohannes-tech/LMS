import CertificateAdminTabs from '@/components/CertificateAdminTabs';

export default function CertificatesLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-5"><CertificateAdminTabs />{children}</div>;
}
