declare module './MarkdownRenderer' {
  export interface MarkdownRendererProps {
    content: string;
  }
  export const MarkdownRenderer: React.FC<MarkdownRendererProps>;
  export default MarkdownRenderer;
}

declare module './JsonViewer' {
  export interface JsonViewerProps {
    data: any;
    expandedByDefault?: boolean;
  }
  export const JsonViewer: React.FC<JsonViewerProps>;
  export default JsonViewer;
}

declare module './HtmlPreview' {
  export interface HtmlPreviewProps {
    html: string;
  }
  export const HtmlPreview: React.FC<HtmlPreviewProps>;
  export default HtmlPreview;
}
