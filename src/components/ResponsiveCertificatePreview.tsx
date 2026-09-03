'use client';

import { useEffect, useRef, useState } from 'react';
import CertificateTemplate from '@/components/CertificateTemplate';
import { Certificate, CertificateSettings } from '@/types';

const CERTIFICATE_WIDTH = 1000;
const CERTIFICATE_HEIGHT = 707;

export default function ResponsiveCertificatePreview({ certificate, settings }: { certificate: Certificate; settings: CertificateSettings }) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const updateScale = () => {
      const availableWidth = Math.max(0, preview.getBoundingClientRect().width);
      const nextScale = Math.min(1, availableWidth / CERTIFICATE_WIDTH);
      setPreviewScale(Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(preview);
    window.addEventListener('orientationchange', updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', updateScale);
    };
  }, [certificate]);

  return (
    <div className="certificate-print-area w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-200/50 p-1 dark:border-slate-800 dark:bg-slate-950 sm:rounded-2xl sm:p-2">
      <div ref={previewRef} className="certificate-preview-viewport mx-auto w-full max-w-[1000px] overflow-hidden">
        <div
          className="certificate-preview-stage relative mx-auto overflow-hidden"
          style={{ width: `${CERTIFICATE_WIDTH * previewScale}px`, height: `${CERTIFICATE_HEIGHT * previewScale}px` }}
        >
          <div
            className="certificate-preview-scale absolute left-0 top-0"
            style={{
              width: `${CERTIFICATE_WIDTH}px`,
              height: `${CERTIFICATE_HEIGHT}px`,
              transform: `scale(${previewScale})`,
              transformOrigin: 'top left'
            }}
          >
            <CertificateTemplate certificate={certificate} settings={settings} />
          </div>
        </div>
      </div>
    </div>
  );
}
