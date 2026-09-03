'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Award, Settings2, SlidersHorizontal } from 'lucide-react';

const tabs = [
  { href: '/admin/certificates', label: 'Daftar Sertifikat', icon: Award },
  { href: '/admin/certificate-training', label: 'Pengaturan per Pelatihan', icon: SlidersHorizontal },
  { href: '/admin/certificate-general', label: 'Pengaturan Umum', icon: Settings2 }
];

export default function CertificateAdminTabs() {
  const pathname = usePathname();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link key={tab.href} href={tab.href} className={`flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors ${active ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white'}`}>
              <tab.icon className="h-4 w-4" />{tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
