"use client";

import { Component, type ReactNode } from "react";

import { Notice } from "@/components/common/Notice";

interface Props {
  /** What failed, e.g. "The 3D view". Used in the message. */
  label: string;
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/** Contains a rendering failure to one part of the screen instead of blanking the page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <Notice
        tone="error"
        title={`${this.props.label} could not be displayed.`}
        action={
          <button className="button" type="button" onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
        }
      >
        The rest of the dashboard is unaffected.
      </Notice>
    );
  }
}
