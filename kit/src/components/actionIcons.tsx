/** Icons of the row actions in button groups (14px, drawn in the text color). */
const stroke = (children: React.ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const DetailsIcon = () => stroke(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);
export const LogsIcon = () => stroke(<path d="M4 6h16M4 10h16M4 14h10M4 18h7" />);
export const RunAgainIcon = () => stroke(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>);
export const DeleteIcon = () => stroke(<><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>);
export const DownloadIcon = () => stroke(<><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>);
export const RevokeIcon = () => stroke(<><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>);
