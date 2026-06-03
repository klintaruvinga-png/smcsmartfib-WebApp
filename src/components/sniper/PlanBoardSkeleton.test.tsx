/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanBoardSkeleton } from "./PlanBoardSkeleton";

describe("PlanBoardSkeleton", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders readiness status header", () => {
    render(<PlanBoardSkeleton />);
    expect(screen.getByText("Readiness Status")).toBeTruthy();
  });

  it("renders the main loading message", () => {
    render(<PlanBoardSkeleton />);
    expect(screen.getByText(/Loading backend-confirmed plans/i)).toBeTruthy();
  });

  it("renders the safety copy that blocks execution", () => {
    render(<PlanBoardSkeleton />);
    expect(screen.getByText(/Do not execute until confirmation arrives/i)).toBeTruthy();
  });

  it("renders the wallet overview skeleton labels", () => {
    render(<PlanBoardSkeleton />);
    expect(screen.getByText("EQUITY")).toBeTruthy();
    expect(screen.getByText("BALANCE")).toBeTruthy();
    expect(screen.getByText("FLOATING P/L")).toBeTruthy();
    expect(screen.getByText("MARGIN LEVEL")).toBeTruthy();
  });

  it("renders the Signal Plans heading", () => {
    render(<PlanBoardSkeleton />);
    expect(screen.getByText("Signal Plans")).toBeTruthy();
  });
});
