export async function generateCertificatePDF(elementId: string, filename: string = 'sertifikat-pelatihan.pdf'): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Elemen sertifikat tidak ditemukan.');
  }

  // Library PDF cukup besar; muat hanya saat tombol unduh ditekan.
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf')
  ]);

  // html2canvas 1.4.x belum mendukung fungsi warna CSS modern seperti lab()/oklab().
  // Clone yang dirender dipaksa memakai warna RGB legacy agar proses unduh stabil
  // pada browser modern/Tailwind tanpa mengubah tampilan sertifikat di layar.
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    width: element.scrollWidth,
    height: element.scrollHeight,
    windowWidth: Math.max(document.documentElement.clientWidth, element.scrollWidth),
    windowHeight: Math.max(document.documentElement.clientHeight, element.scrollHeight),
    onclone: (clonedDocument) => {
      const clonedElement = clonedDocument.getElementById(elementId);
      if (!clonedElement) return;

      const nodes = [clonedElement, ...Array.from(clonedElement.querySelectorAll<HTMLElement>('*'))];
      for (const node of nodes) {
        const computed = clonedDocument.defaultView?.getComputedStyle(node);
        if (!computed) continue;

        const properties = [
          'color',
          'background-color',
          'border-top-color',
          'border-right-color',
          'border-bottom-color',
          'border-left-color',
          'outline-color',
          'text-decoration-color',
          'fill',
          'stroke'
        ];

        for (const property of properties) {
          const value = computed.getPropertyValue(property);
          if (value) node.style.setProperty(property, value);
        }

        // Hindari shadow yang dapat membawa fungsi warna modern dari stylesheet.
        node.style.setProperty('box-shadow', 'none');
        node.style.setProperty('text-shadow', 'none');
      }
    }
  });

  const imgData = canvas.toDataURL('image/png');

  // Create landscape A4 PDF document (297mm x 210mm)
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(filename);
}
