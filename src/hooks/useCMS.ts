import { useState, useEffect } from 'react';
import { getCMSContent, type CMSContent } from '@/lib/cms';

export function useCMS() {
  const [content, setContent] = useState<CMSContent>(getCMSContent());

  useEffect(() => {
    // Listen for storage changes (when admin updates content)
    const handleStorage = () => {
      setContent(getCMSContent());
    };

    window.addEventListener('storage', handleStorage);
    
    // Also check on focus (for same-tab updates)
    const handleFocus = () => {
      setContent(getCMSContent());
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return content;
}
