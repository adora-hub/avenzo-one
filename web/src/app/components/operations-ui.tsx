import type { ReactNode } from 'react'

type OperationsTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

type OperationsPageHeaderProps = {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
}

export function OperationsPageHeader({ eyebrow, title, description, actions }: OperationsPageHeaderProps) {
  return <header className="operations-page-header">
    <div>
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {actions ? <div className="operations-page-actions">{actions}</div> : null}
  </header>
}

type OperationsPanelHeaderProps = {
  eyebrow?: string
  title: ReactNode
  description: string
  count?: ReactNode
}

export function OperationsPanelHeader({ eyebrow, title, description, count }: OperationsPanelHeaderProps) {
  return <div className="operations-panel-header">
    <div>
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    {count ? <div className="operations-panel-count">{count}</div> : null}
  </div>
}

type OperationsFilterBarProps = {
  children: ReactNode
  label: string
}

export function OperationsFilterBar({ children, label }: OperationsFilterBarProps) {
  return <div className="operations-filter-bar" role="group" aria-label={label}>{children}</div>
}

type OperationsStatusBadgeProps = {
  children: ReactNode
  tone?: OperationsTone
  className?: string
}

export function OperationsStatusBadge({ children, tone = 'neutral', className = '' }: OperationsStatusBadgeProps) {
  return <span className={`operations-status-badge ${tone} ${className}`.trim()}>{children}</span>
}

type OperationsDataGridProps = {
  children: ReactNode
  label: string
  className?: string
}

export function OperationsDataGrid({ children, label, className = '' }: OperationsDataGridProps) {
  return <div className={`operations-data-grid ${className}`.trim()} role="list" aria-label={label}>{children}</div>
}

type OperationsEmptyStateProps = {
  title: string
  description: string
  tone?: OperationsTone
  icon?: string
}

export function OperationsEmptyState({ title, description, tone = 'neutral', icon = 'i' }: OperationsEmptyStateProps) {
  return <div className={`operations-empty-state ${tone}`} role="status">
    <span aria-hidden="true">{icon}</span>
    <div><h3>{title}</h3><p>{description}</p></div>
  </div>
}

type OperationsSummaryCardProps = {
  label: string
  value: ReactNode
  description: string
  meta?: ReactNode
}

export function OperationsSummaryCard({ label, value, description, meta }: OperationsSummaryCardProps) {
  return <article className="operations-summary-card">
    <div className="operations-summary-card-heading"><span>{label}</span>{meta}</div>
    <strong>{value}</strong>
    <p>{description}</p>
  </article>
}

type OperationsCardListProps = {
  children: ReactNode
  label: string
  columns?: 2 | 3
}

export function OperationsCardList({ children, label, columns = 3 }: OperationsCardListProps) {
  return <div className={`operations-card-list columns-${columns}`} role="list" aria-label={label}>{children}</div>
}

type OperationsFormSectionProps = {
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}

export function OperationsFormSection({ title, description, children, actions }: OperationsFormSectionProps) {
  return <section className="operations-form-section" aria-labelledby={`operations-form-${title.replace(/\s+/g, '-').toLocaleLowerCase('en-US')}`}>
    <div className="operations-form-section-heading">
      <div><h3 id={`operations-form-${title.replace(/\s+/g, '-').toLocaleLowerCase('en-US')}`}>{title}</h3>{description ? <p>{description}</p> : null}</div>
      {actions ? <div className="operations-form-section-actions">{actions}</div> : null}
    </div>
    <div className="operations-form-section-body">{children}</div>
  </section>
}

type OperationsDetailSheetProps = {
  title: string
  description?: string
  children: ReactNode
  closeAction: ReactNode
}

export function OperationsDetailSheet({ title, description, children, closeAction }: OperationsDetailSheetProps) {
  const titleId = `operations-detail-${title.replace(/\s+/g, '-').toLocaleLowerCase('en-US')}`
  return <aside className="operations-detail-sheet" role="dialog" aria-modal="false" aria-labelledby={titleId}>
    <header><div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div>{closeAction}</header>
    <div className="operations-detail-sheet-body">{children}</div>
  </aside>
}
