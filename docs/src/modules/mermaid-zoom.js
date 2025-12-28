import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

if (ExecutionEnvironment.canUseDOM) {
  // Create Lightbox Elements
  const lightbox = document.createElement('div');
  lightbox.id = 'mermaid-lightbox';
  Object.assign(lightbox.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: '9999',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.3s ease',
    backdropFilter: 'blur(5px)',
  });

  const contentContainer = document.createElement('div');
  Object.assign(contentContainer.style, {
    position: 'relative',
    width: '90vw',
    height: '90vh',
    overflow: 'auto', // Enable scrolling
    borderRadius: '8px',
    backgroundColor: '#1b1b1d', // Dark background as requested (using Docusaurus dark surface tone or just black)
    padding: '20px',
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    border: '1px solid #444', 
  });
  
  // Close Button
  const closeBtn = document.createElement('button');
  closeBtn.innerText = '✕';
  Object.assign(closeBtn.style, {
    position: 'absolute',
    top: '15px',
    right: '15px',
    zIndex: '1001',
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '4px',
    width: '32px',
    height: '32px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  // contentContainer is relative, so we append closeBtn to it
  contentContainer.appendChild(closeBtn);
  closeBtn.onclick = () => {
    lightbox.style.opacity = '0';
    lightbox.style.pointerEvents = 'none';
  };

  // Zoom Toolbar
  const toolbar = document.createElement('div');
  Object.assign(toolbar.style, {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '1002',
    display: 'flex',
    gap: '10px',
    background: 'rgba(0, 0, 0, 0.6)',
    padding: '8px 16px',
    borderRadius: '20px',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255,255,255,0.1)',
  });
  
  // Helper to create buttons
  const createBtn = (text, onClick) => {
    const btn = document.createElement('button');
    btn.innerText = text;
    Object.assign(btn.style, {
      background: 'transparent',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: '4px',
      width: '30px',
      height: '30px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '16px',
      fontWeight: 'bold',
    });
    btn.addEventListener('mouseover', () => btn.style.background = 'rgba(255,255,255,0.1)');
    btn.addEventListener('mouseout', () => btn.style.background = 'transparent');
    btn.onclick = (e) => { e.stopPropagation(); onClick(); };
    return btn;
  };

  let currentScale = 100;
  
  const updateZoom = () => {
    const svg = contentContainer.querySelector('svg');
    if (svg) {
      svg.style.width = `${currentScale}%`;
      // height auto handles the aspect ratio
    }
  };

  const btnOut = createBtn('-', () => {
    currentScale = Math.max(50, currentScale - 25);
    updateZoom();
  });
  
  const btnReset = createBtn('⟲', () => {
    currentScale = 100;
    updateZoom();
  });

  const btnIn = createBtn('+', () => {
    currentScale = Math.min(500, currentScale + 25);
    updateZoom();
  });

  toolbar.appendChild(btnOut);
  toolbar.appendChild(btnReset);
  toolbar.appendChild(btnIn);
  
  // Append toolbar to lightbox (fixed position relative to screen)
  lightbox.appendChild(toolbar);

  lightbox.appendChild(contentContainer);
  document.body.appendChild(lightbox);

  // Close Logic
  const closeLightbox = () => {
    lightbox.style.opacity = '0';
    lightbox.style.pointerEvents = 'none';
  };

  lightbox.addEventListener('click', (e) => {
    // Look up purely based on exact match to overlay (backdrop)
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  // Function to attach zoom behavior
  const attachZoomBehavior = () => {
    const containers = document.querySelectorAll('.docusaurus-mermaid-container');
    
    containers.forEach(container => {
      if (container.dataset.zoomAttached) return;
      container.dataset.zoomAttached = 'true';
      
      const svg = container.querySelector('svg');
      if (!svg) return;

      Object.assign(svg.style, {
        cursor: 'zoom-in',
        transition: 'transform 0.2s',
      });

      container.addEventListener('click', (e) => {
        if(e.target.tagName === 'BUTTON') return;

        while(contentContainer.childNodes.length > 1) { // Keep close button
            if(contentContainer.lastChild !== closeBtn) {
                 contentContainer.removeChild(contentContainer.lastChild);
            } else {
                 break; 
            }
        }
        // Actually slightly cleaner to just clear innerHTML and re-add closeBtn? 
        // Let's stick to cleaning children to avoid recreating closeBtn logic every time or handle it simpler
        // Simplified approach below:
        contentContainer.innerHTML = '';
        contentContainer.appendChild(closeBtn);

        const clonedSvg = svg.cloneNode(true);
        currentScale = 100; // Reset zoom on open
        
        Object.assign(clonedSvg.style, {
          width: '100%',
          height: 'auto',
          maxWidth: 'none',
          maxHeight: 'none',
          cursor: 'grab',
          transform: 'none',
          margin: 'auto', // Center it
        });
        
        clonedSvg.removeAttribute('height');
        clonedSvg.removeAttribute('width');
        clonedSvg.style.color = getComputedStyle(svg).color;

        contentContainer.appendChild(clonedSvg);

        lightbox.style.opacity = '1';
        lightbox.style.pointerEvents = 'auto';
      });
    });
  };

  // Initial Run
  // We need to wait for Mermaid to render. Docusaurus usually renders on mount.
  // MutationObserver is best for SPA changes.
  const observer = new MutationObserver((mutations) => {
    let shouldAttach = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
             if (node.classList && node.classList.contains('docusaurus-mermaid-container')) {
                shouldAttach = true;
             }
             // Also check inside added nodes
             if (node.querySelector && node.querySelector('.docusaurus-mermaid-container')) {
                shouldAttach = true;
             }
          }
        });
      }
    }
    if (shouldAttach) {
      // Small delay to ensure SVG is fully rendered by Mermaid logic
      setTimeout(attachZoomBehavior, 500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Run once on load in case we landed on a page with diagrams
  window.addEventListener('load', () => setTimeout(attachZoomBehavior, 1000));
  
  // Also run on route updates (Docusaurus specific event)
  if (window) {
     const originalPushState = window.history.pushState;
     window.history.pushState = function() {
        originalPushState.apply(this, arguments);
        setTimeout(attachZoomBehavior, 500);
     };
  }
}
