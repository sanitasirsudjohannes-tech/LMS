export async function generateCertificatePDF(elementId: string, filename: string = 'sertifikat-pelatihan.pdf'): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Elemen sertifikat tidak ditemukan.');
  }

  // Gunakan html2canvas-pro karena Tailwind CSS v4/browser modern dapat menghasilkan
  // warna lab()/oklab()/oklch() yang tidak didukung html2canvas 1.4.x.
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf')
  ]);

  const certificateWidth = 1000;
  const certificateHeight = 707;

  // Render dari salinan berukuran asli agar hasil PDF tidak terpengaruh oleh
  // transform/scale preview responsif pada layar mobile maupun desktop.
  const renderHost = document.createElement('div');
  renderHost.style.position = 'fixed';
  renderHost.style.left = '-10000px';
  renderHost.style.top = '0';
  renderHost.style.width = `${certificateWidth}px`;
  renderHost.style.height = `${certificateHeight}px`;
  renderHost.style.overflow = 'hidden';
  renderHost.style.background = '#ffffff';
  renderHost.style.zIndex = '-1';
  renderHost.setAttribute('aria-hidden', 'true');

  const clone = element.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.style.position = 'relative';
  clone.style.inset = 'auto';
  clone.style.top = 'auto';
  clone.style.left = 'auto';
  clone.style.width = `${certificateWidth}px`;
  clone.style.height = `${certificateHeight}px`;
  clone.style.maxWidth = 'none';
  clone.style.minWidth = '0';
  clone.style.minHeight = '0';
  clone.style.margin = '0';
  clone.style.padding = '0';
  clone.style.transform = 'none';
  clone.style.transformOrigin = 'top left';
  clone.style.boxShadow = 'none';
  clone.style.overflow = 'hidden';

  renderHost.appendChild(clone);
  document.body.appendChild(renderHost);

  try {
    // Beri satu frame agar gambar/tanda tangan yang ada pada clone sempat dilayout.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: certificateWidth,
      height: certificateHeight,
      windowWidth: certificateWidth,
      windowHeight: certificateHeight,
      scrollX: 0,
      scrollY: 0
    });

    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Rasio desain 1000x707 hampir identik dengan A4 landscape. Hitung ukuran
    // secara proporsional agar tidak terjadi distorsi, pemotongan, atau ruang kosong berlebihan.
    const imageRatio = certificateWidth / certificateHeight;
    const pageRatio = pdfWidth / pdfHeight;

    let renderWidth = pdfWidth;
    let renderHeight = pdfHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (imageRatio > pageRatio) {
      renderHeight = pdfWidth / imageRatio;
      offsetY = (pdfHeight - renderHeight) / 2;
    } else if (imageRatio < pageRatio) {
      renderWidth = pdfHeight * imageRatio;
      offsetX = (pdfWidth - renderWidth) / 2;
    }

    pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderWidth, renderHeight, undefined, 'FAST');
    pdf.save(filename);
  } finally {
    renderHost.remove();
  }
}
