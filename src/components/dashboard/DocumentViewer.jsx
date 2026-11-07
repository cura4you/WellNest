import { useState, useRef, useCallback, useEffect } from 'react';
import VerifiedStamp from './VerifiedStamp';

export default function DocumentViewer({ url, filename, mimeType, onClose, verifiedColor }) {
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const isPdf = mimeType?.includes('pdf') || filename?.toLowerCase().endsWith('.pdf');
  const isImage = mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename || '');

  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 5));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
  const resetView = () => { setZoom(1); setRotate(0); setPan({ x: 0, y: 0 }); };
  const rotateRight = () => setRotate((r) => (r + 90) % 360);

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.max(0.25, Math.min(5, z + (e.deltaY > 0 ? -0.1 : 0.1))));
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.addEventListener('wheel', handleWheel, { passive: false });
    return () => { if (el) el.removeEventListener('wheel', handleWheel); };
  }, [handleWheel]);

  const onMouseDown = (e) => {
    if (isPdf) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const onMouseUp = () => setDragging(false);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="docviewer-overlay" onClick={onClose}>
      <div className="docviewer-shell" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="docviewer-header">
          <div className="docviewer-title-row">
            <div className="docviewer-badge-mini"><VerifiedStamp size={28} color={verifiedColor} /></div>
            <div>
              <h3 className="docviewer-filename">{filename || 'Document'}</h3>
              <span className="docviewer-verified-tag">
                <span className="upload-dot" />
                WellNest Verified
              </span>
            </div>
          </div>
          <div className="docviewer-controls">
            <button type="button" className="docviewer-btn" onClick={zoomOut} title="Zoom out">−</button>
            <span className="docviewer-zoom-label">{Math.round(zoom * 100)}%</span>
            <button type="button" className="docviewer-btn" onClick={zoomIn} title="Zoom in">+</button>
            <div className="docviewer-sep" />
            <button type="button" className="docviewer-btn" onClick={rotateRight} title="Rotate">↻</button>
            <button type="button" className="docviewer-btn" onClick={resetView} title="Reset view">⟲</button>
            <div className="docviewer-sep" />
            <button type="button" className="docviewer-btn docviewer-download-btn" onClick={handleDownload} title="Download">⤓</button>
            <button type="button" className="docviewer-btn docviewer-close-btn" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* ── Viewport ── */}
        <div
          className="docviewer-viewport"
          ref={containerRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{ cursor: dragging ? 'grabbing' : (isImage ? 'grab' : 'default') }}
        >
          {isPdf ? (
            <iframe
              src={`${url}#toolbar=0`}
              title={filename}
              className="docviewer-pdf"
              style={{ transform: `scale(${zoom}) rotate(${rotate}deg)` }}
            />
          ) : isImage ? (
            <div className="docviewer-image-wrap" style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotate}deg)`,
            }}>
              <img src={url} alt={filename} className="docviewer-image" draggable={false} />
            </div>
          ) : (
            <div className="docviewer-unsupported">
              <p className="docviewer-unsupported-icon">📄</p>
              <p className="docviewer-unsupported-name">{filename}</p>
              <p className="docviewer-unsupported-hint">Preview not available for this file type.</p>
              <button type="button" className="btn btn-primary" onClick={handleDownload}>Download File</button>
            </div>
          )}

          {/* ── Floating verified badge (banner style at bottom right) ── */}
          <div className="docviewer-stamp-float" style={{ bottom: 16, right: 16, top: 'auto', left: 'auto' }}>
            <VerifiedStamp size={70} variant="banner" color={verifiedColor} />
          </div>
        </div>
      </div>
    </div>
  );
}
