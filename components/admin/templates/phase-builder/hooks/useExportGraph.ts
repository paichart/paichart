import { useCallback, RefObject } from 'react';

export function useExportGraph(svgRef: RefObject<SVGSVGElement>, templateName: string) {
  const handleExportSVG = useCallback(() => {
    if (!svgRef.current) return;
    
    try {
      // Clone the SVG element
      const svgClone = svgRef.current.cloneNode(true) as SVGSVGElement;
      
      // Add a white background
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', '100%');
      rect.setAttribute('height', '100%');
      rect.setAttribute('fill', 'white');
      svgClone.insertBefore(rect, svgClone.firstChild);
      
      // Get the SVG as a string
      const svgData = new XMLSerializer().serializeToString(svgClone);
      
      // Create a Blob from the SVG string
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      
      // Create a URL for the Blob
      const url = URL.createObjectURL(blob);
      
      // Create a link element to download the SVG
      const link = document.createElement('a');
      link.href = url;
      link.download = `${templateName.replace(/\s+/g, '-').toLowerCase()}-dependency-graph.svg`;
      
      // Append the link to the document, click it, and remove it
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL object
      URL.revokeObjectURL(url);
    } catch {
      // Could not export SVG
    }
  }, [svgRef, templateName]);
  
  return handleExportSVG;
}
