import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'

/** Catches a crash in one part of the page and shows a friendly card with "Try again" instead of a white screen. */
export default class ErrorBoundary extends Component<{ children: ReactNode; label?: string; compact?: boolean }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error('[ErrorBoundary]', this.props.label ?? '', err, info.componentStack) }
  render() {
    if (!this.state.err) return this.props.children
    const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(this.state.err.message) // new deploy: old file names are gone
    return (
      <div role="alert" className={`card p-6 text-center ${this.props.compact ? 'absolute inset-0 grid place-content-center rounded-none' : 'max-w-md mx-auto my-10'}`}>
        <TriangleAlert className="mx-auto text-warn" size={28} />
        <h2 className="font-semibold text-lg mt-2">Something went wrong</h2>
        <p className="text-sm text-muted mt-1">{this.props.label ? `${this.props.label} could not be shown.` : 'This part of the page could not be shown.'} Please try again.</p>
        <button className="btn btn-primary mt-4 mx-auto" onClick={() => (chunk ? location.reload() : this.setState({ err: null }))}><RotateCcw size={15} />Try again</button>
      </div>
    )
  }
}
