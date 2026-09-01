export function getMediaType(url?: string): 'pdf' | 'video' | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (
    lower.endsWith('.pdf') ||
    lower.includes('.pdf') ||
    lower.includes('drive.google.com') ||
    lower.includes('docs.google.com')
  ) {
    return 'pdf';
  }
  if (
    lower.includes('youtube.com') ||
    lower.includes('youtu.be') ||
    lower.includes('vimeo.com') ||
    lower.endsWith('.mp4') ||
    lower.endsWith('.webm')
  ) {
    return 'video';
  }
  return 'pdf'; // Default fallback for doc/pdf links
}

export function formatGoogleDriveEmbedUrl(url: string): string {
  if (!url) return url;
  
  // Transform Google Drive links: https://drive.google.com/file/d/FILE_ID/view... -> https://drive.google.com/file/d/FILE_ID/preview
  if (url.includes('drive.google.com/file/d/')) {
    const fileIdMatch = url.match(/\/file\/d\/([^\/]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
    }
  }
  
  // Google Docs / Sheets / Slides view -> preview
  if (url.includes('docs.google.com')) {
    if (url.includes('/edit') || url.includes('/view')) {
      return url.replace(/\/edit.*$/, '/preview').replace(/\/view.*$/, '/preview');
    }
    if (!url.endsWith('/preview')) {
      return `${url}/preview`;
    }
  }

  return url;
}
