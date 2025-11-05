'use client';

import { useEffect } from 'react';

const ImageEnhancer = () => {
  useEffect(() => {
    const enhanceImages = () => {
      const images = document.querySelectorAll('img');
      
      images.forEach(img => {
        if (img.hasAttribute('data-enhanced')) return;
        
        if (!img.getAttribute('loading')) {
          img.setAttribute('loading', 'lazy');
        }
        
        if (!img.hasAttribute('width') && !img.hasAttribute('height')) {
          const naturalWidth = img.naturalWidth || 400;
          const naturalHeight = img.naturalHeight || 300;
          img.setAttribute('width', naturalWidth.toString());
          img.setAttribute('height', naturalHeight.toString());
        }
        
        if (!img.hasAttribute('alt')) {
          img.setAttribute('alt', 'Product image');
        }
        
        img.setAttribute('data-enhanced', 'true');
        
        img.addEventListener('load', function() {
          this.style.opacity = '1';
          this.setAttribute('loaded', 'true');
        });
      });
    };
    
    enhanceImages();
    
    const observer = new MutationObserver(enhanceImages);
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    return () => observer.disconnect();
  }, []);
  
  return null;
};

export default ImageEnhancer;