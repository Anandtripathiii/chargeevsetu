export const tooltipBox = (html: string) => ({
  html,
  style: {
    background: 'var(--panel-solid)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: '10px',
    padding: '10px 12px', fontSize: '12px', lineHeight: '1.5', maxWidth: '290px', boxShadow: 'var(--shadow)',
  },
})
