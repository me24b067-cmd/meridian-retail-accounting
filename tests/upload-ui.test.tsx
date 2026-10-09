// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UploadTester } from "@/components/UploadTester";
import { loadBaseChart } from "@/lib/database/csv";

afterEach(cleanup);
const accounts = loadBaseChart();
const sample = fs.readFileSync(path.join(process.cwd(), "data", "sample_transactions.csv"), "utf8");
const dropZone = () => screen.getByRole("button", { name: /drop a csv file here/i });
const drop = (content: string, name = "mine.csv") =>
  fireEvent.drop(dropZone(), { dataTransfer: { files: [new File([content], name, { type: "text/csv" })] } });

describe("Upload & Test CSV (browser UI)", () => {
  it("shows the drag-and-drop box and the helper buttons before any file is loaded", () => {
    render(<UploadTester accounts={accounts} />);
    expect(screen.getByText(/drag & drop your transactions csv here/i)).toBeTruthy();
    expect(screen.getByText(/download blank template/i)).toBeTruthy();
    expect(screen.getByText(/try with the built-in sample/i)).toBeTruthy();
  });

  it("dropping a valid file shows balanced statements, the checks and the download buttons", async () => {
    render(<UploadTester accounts={accounts} />);
    drop(sample, "sample.csv");
    await waitFor(() => expect(screen.getByText(/ALL CHECKS PASS/)).toBeTruthy());
    expect(screen.getByText(/Loaded:/).textContent).toContain("sample.csv");
    expect(screen.getAllByText("111 → 111").length).toBe(1);
    expect(screen.getByText("TOTAL ASSETS")).toBeTruthy();
    expect(screen.getByText("₹44,71,605.86".replace("₹", "₹"), { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Validation" }));
    expect(screen.getByText(/Balance Sheet: Total Assets = Total Liabilities \+ Total Equity/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /excel workbook/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /balance sheet\.csv/i })).toBeTruthy();
  });

  it("dropping a file with mistakes lists every problem with its row number and shows no statements", async () => {
    render(<UploadTester accounts={accounts} />);
    drop("txn_id,date,type,description,amount,account,settle\nA,2025-05-01,CAPITAL,ok,1000,,1002\nB,2025-05-02,EXPENSE,bad acct,10,9999,1002\nC,2025-05-03,NOPE,bad type,10,,1002\n");
    await waitFor(() => expect(screen.getByText(/2 problem\(s\) found in 3 rows/)).toBeTruthy());
    expect(screen.getByText(/unknown account code "9999"/)).toBeTruthy();
    expect(screen.getByText(/Unknown transaction type/)).toBeTruthy();
    expect(screen.queryByText("TOTAL ASSETS")).toBeNull();
  });

  it("explains an unusable file in plain words", async () => {
    render(<UploadTester accounts={accounts} />);
    drop("hello,world\n1,2\n");
    await waitFor(() => expect(screen.getByText(/missing required column/i)).toBeTruthy());
  });

  it("clear resets the page", async () => {
    render(<UploadTester accounts={accounts} />);
    drop(sample);
    await waitFor(() => expect(screen.getByText(/ALL CHECKS PASS/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText(/ALL CHECKS PASS/)).toBeNull();
  });
});
