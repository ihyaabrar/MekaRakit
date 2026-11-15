"use client";

// Error boundary for things loaded inside the Canvas (model files, desk props). Suspense only covers the wait;
// a failed load throws, and without this the whole workbench unmounts.
import { Component, type ReactNode } from "react";

type Props = { fallback?: ReactNode; onError?: (e: unknown) => void; children: ReactNode };

export default class Catch extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.error(e);
    this.props.onError?.(e);
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
