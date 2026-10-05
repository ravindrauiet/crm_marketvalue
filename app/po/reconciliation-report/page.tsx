"use client";
import { useState, useEffect, useMemo } from 'react';
import { readJson } from '@/lib/http';
import Link from 'next/link';
import * as XLSX from 'xlsx';

type ItemDetail = {
  id: string;
  chainItemCode: string;
  chainItemName: string;
  tallyItemName: string;
  brandName: string;
  eanCode?: string;
  poQtyPcs: number;
  deliveredQtyPcs: number;
  shortageQtyPcs: number;
  unitPrice: number;
  poTotalPrice: number;
  billedTotalPrice: number;
  itemFillRatePct: number;
  itemRemark: string;
};

type PaymentInstallment = {
  installmentNo: number;
  paymentDate: string;
  bankRef: string;
  narration: string;
  amountPaid: number;
  tdsAmount: number;
  matchedInvoiceNo: string;
  batchId: string;
};

type ReportRow = {
  id: string;
  accountName: string;
  brand: string;
  allBrands: string[];
  poNumber: string;
  dcLocation: string;
  poDate: string;
  poExpDate: string;
  poExpMonth: string;
  fullMonthYear: string;
  poStatus: string;
  location: string;
  poValueInRs: number;
  deliveryValueInRs: number;
  totalPaymentsReceived: number;
  netPendingBalance: number;
  setOffStatus: 'FULLY_SET_OFF' | 'PARTIAL_PAID' | 'UNPAID';
  paymentInstallments: PaymentInstallment[];
  installmentCount: number;
  poQtyPcs: number;
  deliveredQtyPcs: number;
  invoiceNo: string;
  invoiceDate: string;
  fillRateValuePct: number;
  fillRateQtyPct: number;
  fillRatePct: number;
  remarks: string;
  remarks1?: string;
  remarks2?: string;
  remarks3?: string;
  remarks4?: string;
  itemDetails: ItemDetail[];
};

type ReportSummary = {
  totalPOs: number;
  deliveredPOs: number;
  partDeliveredPOs: number;
  closedPOs: number;
  openPOs: number;
  totalPOValue: number;
  totalBilledValue: number;
  totalPOQty: number;
  totalDeliveredQty: number;
  overallValueFillRatePct: number;
  overallQtyFillRatePct: number;
};

const CHAINS = ['ALL', 'RELIANCE', 'SWIGGY', 'ZEPTO', 'BIGBASKET', 'BLINKIT', 'FLIPKART', 'DMART', 'CITYMALL', 'DEERIKA', 'VISHAL', 'OTHER'];
const BRANDS = ['ALL', 'HEALTHY HUNGER', 'MARVEL', 'EASTERN', "MOTHER'S RECIPE", 'DILBAHAR', 'GENERAL'];
const STATUSES = ['ALL', 'Full Delivery', 'Part Delivery', 'PO Closed', 'Open / Pending'];
const MONTHS: Array<[string, string]> = [
  ['JAN', 'January'], ['FEB', 'February'], ['MAR', 'March'], ['APR', 'April'], ['MAY', 'May'], ['JUN', 'June'],
  ['JUL', 'July'], ['AUG', 'August'], ['SEP', 'September'], ['OCT', 'October'], ['NOV', 'November'], ['DEC', 'December'],
];
type RemarkField = 'remarks1' | 'remarks2' | 'remarks3' | 'remarks4';

type SaleItemRow = {
  id: string;
  invoiceDate: string;
  invoiceNumber: string;
  partyName: string;
  poNumber: string;
  itemName: string;
  quantity: number;
  rate: number;
  amount: number;
  fileName: string;
};

export default function POFillRateReportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  // Filter States
  const [selectedChain, setSelectedChain] = useState('ALL');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState('ALL');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');

  // UI View States
  const [activeTab, setActiveTab] = useState<'summary' | 'item_detail' | 'installments' | 'sale_items'>('summary');
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'items' | 'payments'>('items');

  // Inline Editable Remarks State (Remarks 1..4)
  const [editedRemarks, setEditedRemarks] = useState<Record<string, { remarks1?: string; remarks2?: string; remarks3?: string; remarks4?: string }>>({});

  const [remarkSaveStatus, setRemarkSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});

  const handleRemarkChange = (poId: string, field: RemarkField, val: string) => {
    setEditedRemarks(prev => ({
      ...prev,
      [poId]: {
        ...prev[poId],
        [field]: val
      }
    }));
  };

  // Persist an edited remark to the PO when the input loses focus
  const saveRemark = async (poId: string, field: RemarkField) => {
    const val = editedRemarks[poId]?.[field];
    if (val === undefined) return;
    const row = rows.find(r => r.id === poId);
    if (row && (row[field] ?? '') === val) return;

    const key = `${poId}:${field}`;
    setRemarkSaveStatus(prev => ({ ...prev, [key]: 'saving' }));
    try {
      const res = await fetch('/api/po/reconciliation-report/remarks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poId, [field]: val }),
      });
      const data = await readJson(res, 'the upload');
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setRows(prev => prev.map(r => r.id === poId ? { ...r, [field]: val.trim() } : r));
      setRemarkSaveStatus(prev => ({ ...prev, [key]: 'saved' }));
    } catch {
      setRemarkSaveStatus(prev => ({ ...prev, [key]: 'error' }));
    }
  };

  const remarkBorder = (poId: string, field: RemarkField) => {
    const s = remarkSaveStatus[`${poId}:${field}`];
    return s === 'saved' ? '1px solid #22c55e' : s === 'error' ? '1px solid #ef4444' : s === 'saving' ? '1px solid #f59e0b' : '1px solid #cbd5e1';
  };

  // Daily Upload Calendar Tracker States
  const [uploadedDatesMap, setUploadedDatesMap] = useState<Record<string, { count: number; invoicesCount: number; totalAmount: number }>>({});
  const [calYear, setCalYear] = useState<number>(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState<number>(() => new Date().getMonth()); // 0-indexed
  const [uploadingReport, setUploadingReport] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sale Invoice Item Wise tab (daily uploaded Tally sale invoices)
  const [saleFrom, setSaleFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA');
  });
  const [saleTo, setSaleTo] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [saleSearch, setSaleSearch] = useState('');
  const [saleRows, setSaleRows] = useState<SaleItemRow[]>([]);
  const [saleTotals, setSaleTotals] = useState({ invoices: 0, lines: 0, quantity: 0, amount: 0 });
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState('');

  const fetchSaleItems = async () => {
    setSaleLoading(true);
    setSaleError('');
    try {
      const params = new URLSearchParams();
      if (saleFrom) params.set('from', saleFrom);
      if (saleTo) params.set('to', saleTo);
      if (saleSearch) params.set('search', saleSearch);
      const res = await fetch(`/api/po/reconciliation-report/sale-items?${params.toString()}`);
      const data = await readJson(res, 'the upload');
      if (!res.ok) throw new Error(data.error || 'Failed to load sale invoice items');
      setSaleRows(data.rows || []);
      setSaleTotals(data.totals || { invoices: 0, lines: 0, quantity: 0, amount: 0 });
    } catch (err: any) {
      setSaleError(err.message);
    } finally {
      setSaleLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sale_items') fetchSaleItems();
  }, [activeTab, saleFrom, saleTo]);

  const setSaleRange = (preset: 'today' | 'yesterday' | 'week' | 'month') => {
    const today = new Date();
    const fmt = (d: Date) => d.toLocaleDateString('en-CA');
    if (preset === 'today') { setSaleFrom(fmt(today)); setSaleTo(fmt(today)); }
    else if (preset === 'yesterday') { const y = new Date(today); y.setDate(y.getDate() - 1); setSaleFrom(fmt(y)); setSaleTo(fmt(y)); }
    else if (preset === 'week') { const w = new Date(today); w.setDate(w.getDate() - 6); setSaleFrom(fmt(w)); setSaleTo(fmt(today)); }
    else { setSaleFrom(fmt(new Date(today.getFullYear(), today.getMonth(), 1))); setSaleTo(fmt(today)); }
  };

  const exportSaleItems = () => {
    if (saleRows.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(saleRows.map(r => ({
      'Invoice Date': r.invoiceDate,
      'Invoice No': r.invoiceNumber,
      'Party Name': r.partyName,
      'PO Number': r.poNumber,
      'Item Name': r.itemName,
      'Quantity (Pcs)': r.quantity,
      'Rate (Rs.)': r.rate,
      'Amount (Rs.)': r.amount,
      'Source File': r.fileName,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sale Invoice Item Wise');
    XLSX.writeFile(wb, `Sale_Invoice_Item_Wise_${saleFrom}_to_${saleTo}.xlsx`);
  };

  const fetchReport = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (selectedChain !== 'ALL') params.set('chain', selectedChain);
      if (selectedBrand !== 'ALL') params.set('brand', selectedBrand);
      if (selectedStatus !== 'ALL') params.set('status', selectedStatus);
      if (selectedMonth !== 'ALL') params.set('month', selectedMonth);
      if (search) params.set('search', search);

      const res = await fetch(`/api/po/reconciliation-report?${params.toString()}`);
      const data = await readJson(res, 'the upload');
      if (!res.ok) throw new Error(data.error || 'Failed to load report');

      setRows(data.rows || []);
      setSummary(data.summary || null);
      setEditedRemarks({});
      setRemarkSaveStatus({});
      if (data.uploadedDatesMap) {
        setUploadedDatesMap(data.uploadedDatesMap);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedChain, selectedBrand, selectedStatus, selectedMonth, startDate, endDate]);

  const handleDailyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingReport(true);
    setUploadStatus(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/po/reconciliation-report/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await readJson(res, 'the upload');
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setUploadStatus({ type: 'success', message: data.message || 'Report uploaded successfully!' });
      await fetchReport();
      if (activeTab === 'sale_items') await fetchSaleItems();
    } catch (err: any) {
      setUploadStatus({ type: 'error', message: err.message });
    } finally {
      setUploadingReport(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleQuickImport = async () => {
    setUploadingReport(true);
    setUploadStatus(null);
    try {
      const res = await fetch('/api/po/reconciliation-report/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quickImport: true }),
      });
      const data = await readJson(res, 'the upload');
      if (!res.ok) throw new Error(data.error || 'Quick import failed');

      setUploadStatus({ type: 'success', message: data.message || 'Quick import completed!' });
      await fetchReport();
    } catch (err: any) {
      setUploadStatus({ type: 'error', message: err.message });
    } finally {
      setUploadingReport(false);
    }
  };

  const calendarDays = useMemo(() => {
    const totalDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay(); // 0 = Sun, 1 = Mon ...
    const startOffset = (firstDayOfWeek + 6) % 7; // Mon start

    const days: Array<{
      dateNumber: number;
      dateKey: string;
      isCurrentMonth: boolean;
      uploadedData?: { count: number; invoicesCount: number; totalAmount: number };
    }> = [];

    for (let i = 0; i < startOffset; i++) {
      days.push({ dateNumber: 0, dateKey: `prev-${i}`, isCurrentMonth: false });
    }

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const mStr = String(calMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const dateKey = `${calYear}-${mStr}-${dStr}`;
      days.push({
        dateNumber: d,
        dateKey,
        isCurrentMonth: true,
        uploadedData: uploadedDatesMap[dateKey]
      });
    }

    return days;
  }, [calYear, calMonth, uploadedDatesMap]);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Export to Multi-Sheet Excel Workbook (.xlsx)
  const exportToExcel = () => {
    if (!rows || rows.length === 0) return;

    // Sheet 1: PO Level Summary Report (Matching Client Specification 1-8)
    const poSummarySheetData = rows.map(r => {
      const r1 = editedRemarks[r.id]?.remarks1 ?? r.remarks1 ?? r.remarks ?? '';
      const r2 = editedRemarks[r.id]?.remarks2 ?? r.remarks2 ?? '';
      const r3 = editedRemarks[r.id]?.remarks3 ?? r.remarks3 ?? '';
      const r4 = editedRemarks[r.id]?.remarks4 ?? r.remarks4 ?? '';

      return {
        'Account / Chain': r.accountName,
        'Brand': r.brand,
        'PO Number': r.poNumber,
        'FC / DC Location': r.dcLocation,
        'PO Date': r.poDate,
        'PO Exp Month': r.poExpMonth,
        'PO Status': r.poStatus,
        'PO Value (Rs.)': r.poValueInRs,
        'PO Delivered Value (Rs.)': r.deliveryValueInRs,
        'PO Quantity (Pcs)': r.poQtyPcs,
        'PO Delivered Qty (Pcs)': r.deliveredQtyPcs,
        'Invoice Date': r.invoiceDate,
        'Invoice No': r.invoiceNo,
        'Fill Rate %': `${r.fillRatePct}%`,
        'REMARKS 1': r1,
        'REMARKS 2': r2,
        'REMARKS 3': r3,
        'REMARKS 4': r4,
      };
    });

    // Sheet 2: Item Level Detail Breakdown
    const itemDetailSheetData: any[] = [];
    rows.forEach(r => {
      r.itemDetails.forEach(item => {
        itemDetailSheetData.push({
          'PO Number': r.poNumber,
          'Account / Chain': r.accountName,
          'Brand': item.brandName,
          'Chain Item Code': item.chainItemCode,
          'Chain Item Name': item.chainItemName,
          'Tally Item Name': item.tallyItemName || '—',
          'EAN Code': item.eanCode || '—',
          'PO Qty (Pcs)': item.poQtyPcs,
          'Delivered Qty (Pcs)': item.deliveredQtyPcs,
          'Shortage Qty (Pcs)': item.shortageQtyPcs,
          'PO Unit Rate (Rs.)': item.unitPrice,
          'PO Total Price (Rs.)': item.poTotalPrice,
          'Billed Total Price (Rs.)': item.billedTotalPrice,
          'Item Fill Rate %': `${item.itemFillRatePct}%`,
          'Item Remarks': item.itemRemark,
        });
      });
    });

    // Sheet 3: Multi-Installment Payment Remittances History
    const paymentInstallmentSheetData: any[] = [];
    rows.forEach(r => {
      if (r.paymentInstallments && r.paymentInstallments.length > 0) {
        r.paymentInstallments.forEach(inst => {
          paymentInstallmentSheetData.push({
            'PO Number': r.poNumber,
            'Account / Chain': r.accountName,
            'Installment #': inst.installmentNo,
            'Payment Arrival Date': inst.paymentDate,
            'Bank Ref / UTR': inst.bankRef,
            'Matched Invoice No': inst.matchedInvoiceNo,
            'Amount Paid (Rs.)': inst.amountPaid,
            'TDS / Deduction (Rs.)': inst.tdsAmount,
            'Narration / Description': inst.narration,
          });
        });
      } else {
        paymentInstallmentSheetData.push({
          'PO Number': r.poNumber,
          'Account / Chain': r.accountName,
          'Installment #': '—',
          'Payment Arrival Date': '—',
          'Bank Ref / UTR': 'No payment received yet',
          'Matched Invoice No': r.invoiceNo,
          'Amount Paid (Rs.)': 0,
          'TDS / Deduction (Rs.)': 0,
          'Narration / Description': 'Pending Payment',
        });
      }
    });

    // Sheet 4: KPI Executive Summary
    const kpiSummaryData = summary ? [
      { Metric: 'Total POs Count', Value: summary.totalPOs },
      { Metric: 'Full Delivery POs Count', Value: summary.deliveredPOs },
      { Metric: 'Part Delivery POs Count', Value: summary.partDeliveredPOs ?? 0 },
      { Metric: 'Closed POs Count', Value: summary.closedPOs },
      { Metric: 'Open / Pending POs Count', Value: summary.openPOs },
      { Metric: 'Total PO Value (Rs.)', Value: summary.totalPOValue },
      { Metric: 'Total Billed Value (Rs.)', Value: summary.totalBilledValue },
      { Metric: 'Total PO Qty (Pcs)', Value: summary.totalPOQty },
      { Metric: 'Total Delivered Qty (Pcs)', Value: summary.totalDeliveredQty },
      { Metric: 'Overall Value Fill Rate %', Value: `${summary.overallValueFillRatePct}%` },
      { Metric: 'Overall Qty Fill Rate %', Value: `${summary.overallQtyFillRatePct}%` },
    ] : [];

    const wb = XLSX.utils.book_new();
    const wsPOs = XLSX.utils.json_to_sheet(poSummarySheetData);
    const wsItems = XLSX.utils.json_to_sheet(itemDetailSheetData);
    const wsPayments = XLSX.utils.json_to_sheet(paymentInstallmentSheetData);
    const wsKPI = XLSX.utils.json_to_sheet(kpiSummaryData);

    XLSX.utils.book_append_sheet(wb, wsPOs, 'PO Summary Report');
    XLSX.utils.book_append_sheet(wb, wsItems, 'Item Level Breakdown');
    XLSX.utils.book_append_sheet(wb, wsPayments, 'Payment Installments');
    XLSX.utils.book_append_sheet(wb, wsKPI, 'Fill Rate Summary');

    const filename = `PO_Fill_Rate_Reconciliation_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handlePrint = () => {
    window.print();
  };

  // Flattened items for Item Level Tab
  const allItemRows = useMemo(() => {
    const list: any[] = [];
    rows.forEach(r => {
      r.itemDetails.forEach(item => {
        list.push({
          ...item,
          poNumber: r.poNumber,
          accountName: r.accountName,
          poDate: r.poDate,
          dcLocation: r.dcLocation,
          invoiceNo: r.invoiceNo,
          poStatus: r.poStatus
        });
      });
    });
    return list;
  }, [rows]);

  // Flattened payments for Payment Installments Tab
  const allPaymentInstallments = useMemo(() => {
    const list: any[] = [];
    rows.forEach(r => {
      if (r.paymentInstallments && r.paymentInstallments.length > 0) {
        r.paymentInstallments.forEach(inst => {
          list.push({
            ...inst,
            poNumber: r.poNumber,
            accountName: r.accountName,
            poValue: r.poValueInRs,
            netPendingBalance: r.netPendingBalance,
            setOffStatus: r.setOffStatus
          });
        });
      }
    });
    return list;
  }, [rows]);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
      {/* Printable Style Header */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          header, footer, .no-print { display: none !important; }
          .container { width: 100% !important; max-width: 100% !important; padding: 0 !important; }
          .print-title { display: block !important; }
          table { font-size: 10px !important; }
          td, th { padding: 4px 6px !important; }
        }
      `}} />

      {/* Page header */}
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">PO Fill Rate &amp; Reconciliation</h1>
          <p className="page-subtitle">
            Chain POs against GLOMIN billed invoices, with delivery fill rate, multi-installment remittances and set-off status.
          </p>
        </div>

        <div className="page-actions">
          <label className="btn" style={{ cursor: uploadingReport ? 'not-allowed' : 'pointer' }}>
            {uploadingReport ? 'Uploading…' : 'Upload daily sale invoices'}
            <input
              type="file"
              accept=".xls,.xlsx,.csv"
              onChange={handleDailyUpload}
              disabled={uploadingReport}
              style={{ display: 'none' }}
            />
          </label>
          <button onClick={exportToExcel} className="btn secondary">
            Export Excel
          </button>
          <button onClick={handlePrint} className="btn secondary">
            Print / PDF
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card no-print" style={{ padding: 20, marginBottom: 24, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'center' }}>
          
          {/* 1. Date Range Picker (1 Year Filter) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              From Date (1-Year Filter)
            </label>
            <input
              type="date"
              className="input"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 13 }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              To Date
            </label>
            <input
              type="date"
              className="input"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 13 }}
            />
          </div>

          {/* 2. Month Selector */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              Expiry / PO Month
            </label>
            <select
              className="input"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 13 }}
            >
              <option value="ALL">All Months</option>
              {MONTHS.map(([code, name]) => (
                <option key={code} value={code}>{code} ({name})</option>
              ))}
            </select>
          </div>

          {/* 3. Account / Chain Selector */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              Account / Retail Chain
            </label>
            <select
              className="input"
              value={selectedChain}
              onChange={e => setSelectedChain(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 13 }}
            >
              {CHAINS.map(c => (
                <option key={c} value={c}>{c === 'ALL' ? 'All Retail Chains' : c}</option>
              ))}
            </select>
          </div>

          {/* 4. Brand Selector */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              Brand Selection
            </label>
            <select
              className="input"
              value={selectedBrand}
              onChange={e => setSelectedBrand(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 13 }}
            >
              {BRANDS.map(b => (
                <option key={b} value={b}>{b === 'ALL' ? 'All Brands' : b}</option>
              ))}
            </select>
          </div>

          {/* 5. PO Status Selector */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              PO Status
            </label>
            <select
              className="input"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 13 }}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Search Bar */}
        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <input
            type="text"
            className="input"
            placeholder="Search by PO Number, Invoice #, Brand, DC Location, Item Code, Remarks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '9px 14px', fontSize: 13 }}
          />
          <button onClick={fetchReport} className="btn primary" style={{ fontSize: 13, padding: '8px 16px' }}>
            Filter Report
          </button>
        </div>
      </div>

      {/* Brand Tabs Bar */}
      <div className="no-print" style={{ marginBottom: 20, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', alignSelf: 'center', marginRight: 4 }}>
          Brand Tabs:
        </span>
        {BRANDS.map(brand => (
          <button
            key={brand}
            onClick={() => setSelectedBrand(brand)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: selectedBrand === brand ? 700 : 500,
              borderRadius: 20,
              border: selectedBrand === brand ? '1px solid #2563eb' : '1px solid #cbd5e1',
              background: selectedBrand === brand ? '#eff6ff' : '#fff',
              color: selectedBrand === brand ? '#1d4ed8' : '#475569',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {brand === 'ALL' ? 'All Brands' : `${brand}`}
          </button>
        ))}
      </div>

      {/* DAILY TALLY REPORT UPLOAD & CALENDAR TRACKER CARD */}
      <div className="card no-print" style={{ padding: 20, marginBottom: 24, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10 }}>
        
        {/* Card Header & Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              Daily Tally Sales Report Upload & Calendar Tracker
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b' }}>
              Upload daily Tally Excel sales reports (e.g. <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>Tally/SALE REPORT_JULY_.xls</code>) to reconcile PO Fill Rates & check daily upload ticks (✓).
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* File Upload Button */}
            <label className="btn primary" style={{ cursor: uploadingReport ? 'not-allowed' : 'pointer', fontSize: 12, padding: '7px 14px', background: '#2563eb', color: '#fff', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span>{uploadingReport ? 'Uploading & Reconciling...' : 'Upload Daily Tally Excel (.xls/.xlsx)'}</span>
              <input
                type="file"
                accept=".xls,.xlsx,.csv"
                onChange={handleDailyUpload}
                disabled={uploadingReport}
                style={{ display: 'none' }}
              />
            </label>

            {/* Quick Import Tally/SALE REPORT_JULY_.xls (local development only) */}
            {process.env.NODE_ENV !== 'production' && (
            <button
              onClick={handleQuickImport}
              disabled={uploadingReport}
              className="btn"
              style={{
                fontSize: 12,
                padding: '7px 14px',
                background: '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: uploadingReport ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              Quick Import (Tally/SALE REPORT_JULY_.xls)
            </button>
            )}
          </div>
        </div>

        {/* Status Notification Banner */}
        {uploadStatus && (
          <div style={{
            padding: '10px 14px',
            marginBottom: 16,
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            background: uploadStatus.type === 'success' ? '#dcfce7' : '#fef2f2',
            color: uploadStatus.type === 'success' ? '#166534' : '#991b1b',
            border: uploadStatus.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>{uploadStatus.type === 'success' ? '' : ''} {uploadStatus.message}</span>
            <button onClick={() => setUploadStatus(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'inherit' }}>✕</button>
          </div>
        )}

        {/* Month Navigation & Legend Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => {
                if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
                else { setCalMonth(m => m - 1); }
              }}
              style={{ padding: '4px 10px', fontSize: 12, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}
            >
              ◀ Prev
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
              {monthNames[calMonth]} {calYear}
            </span>
            <button
              onClick={() => {
                if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
                else { setCalMonth(m => m + 1); }
              }}
              style={{ padding: '4px 10px', fontSize: 12, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}
            >
              Next ▶
            </button>
            <button
              onClick={() => { const d = new Date(); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
              style={{ padding: '4px 10px', fontSize: 11, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 4, cursor: 'pointer' }}
            >
              This Month
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, fontSize: 11, fontWeight: 600 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#15803d' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
              ✓ Uploaded (Reconciled)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#64748b' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#cbd5e1', display: 'inline-block' }}></span>
              Pending Upload
            </span>
          </div>
        </div>

        {/* Days Grid Header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
          <div>Sun</div>
        </div>

        {/* Days Grid Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {calendarDays.map((day, idx) => {
            if (!day.isCurrentMonth) {
              return <div key={idx} style={{ minHeight: 52, background: '#f8fafc', borderRadius: 6, border: '1px dashed #e2e8f0' }}></div>;
            }

            const isUploaded = !!day.uploadedData;
            const stats = day.uploadedData;

            return (
              <div
                key={day.dateKey}
                style={{
                  minHeight: 56,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: isUploaded ? '1px solid #86efac' : '1px solid #e2e8f0',
                  background: isUploaded ? '#f0fdf4' : '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: isUploaded ? '#166534' : '#334155' }}>
                    {day.dateNumber}
                  </span>

                  {isUploaded ? (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 10,
                      background: '#22c55e',
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 2
                    }}>
                      ✓ Uploaded
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Pending</span>
                  )}
                </div>

                {isUploaded && stats ? (
                  <div style={{ fontSize: 10, color: '#15803d', marginTop: 4, fontWeight: 600 }}>
                    <div>{stats.invoicesCount} Invoices</div>
                    <div style={{ fontSize: 9, color: '#047857' }}>₹{stats.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 9, color: '#cbd5e1', marginTop: 4 }}>No report</div>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* KPI Executive Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
          
          <div className="card" style={{ padding: 18, borderLeft: '4px solid #2563eb', background: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Total PO Value</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              ₹{summary.totalPOValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Billed: <strong style={{ color: '#16a34a' }}>₹{summary.totalBilledValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong>
            </div>
          </div>

          <div className="card" style={{ padding: 18, borderLeft: '4px solid #16a34a', background: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Overall Value Fill Rate</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: summary.overallValueFillRatePct >= 80 ? '#16a34a' : '#d97706', marginTop: 4 }}>
              {summary.overallValueFillRatePct}%
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Qty Fill Rate: <strong>{summary.overallQtyFillRatePct}%</strong>
            </div>
          </div>

          <div className="card" style={{ padding: 18, borderLeft: '4px solid #8b5cf6', background: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Total Quantity (Pcs)</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              {summary.totalPOQty.toLocaleString('en-IN')} <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b' }}>Pcs</span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Delivered: <strong style={{ color: '#16a34a' }}>{summary.totalDeliveredQty.toLocaleString('en-IN')} Pcs</strong>
            </div>
          </div>

          <div className="card" style={{ padding: 18, borderLeft: '4px solid #0284c7', background: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>PO Status Breakdown</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
              {summary.totalPOs} Total POs
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              <span style={{ color: '#16a34a', fontWeight: 600 }}>{summary.deliveredPOs} Full</span> • <span style={{ color: '#d97706', fontWeight: 600 }}>{summary.partDeliveredPOs ?? 0} Part</span> • <span style={{ color: '#dc2626', fontWeight: 600 }}>{summary.closedPOs} Closed</span> • <span>{summary.openPOs} Open</span>
            </div>
          </div>

        </div>
      )}

      {/* Main View Tabs */}
      <div className="tabs no-print" role="tablist">
        {([
          ['summary', 'PO summary', rows.length],
          ['item_detail', 'Item-level detail', allItemRows.length],
          ['installments', 'Payment installments', allPaymentInstallments.length],
          ['sale_items', 'Sale invoices (item-wise)', undefined],
        ] as const).map(([id, label, count]) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={`tab${activeTab === id ? ' active' : ''}`}
          >
            {label}
            {count !== undefined && <span className="tab-count">{count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'sale_items' ? (

        /* TAB 4: SALE INVOICE ITEM WISE (Daily uploaded Tally sale invoices) */
        <div>
          <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14, padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Invoice Date From</label>
              <input type="date" className="input" value={saleFrom} onChange={e => setSaleFrom(e.target.value)} style={{ padding: '7px 10px', fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Invoice Date To</label>
              <input type="date" className="input" value={saleTo} onChange={e => setSaleTo(e.target.value)} style={{ padding: '7px 10px', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 Days'], ['month', 'This Month']] as const).map(([p, label]) => (
                <button key={p} onClick={() => setSaleRange(p)} style={{ padding: '7px 10px', fontSize: 12, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="input"
              placeholder="Search Invoice No, Party, PO No, Item..."
              value={saleSearch}
              onChange={e => setSaleSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') fetchSaleItems(); }}
              style={{ padding: '7px 12px', fontSize: 13, flex: 1, minWidth: 200 }}
            />
            <button onClick={fetchSaleItems} className="btn primary" style={{ fontSize: 13, padding: '7px 14px' }}>Search</button>
            <button onClick={exportSaleItems} disabled={saleRows.length === 0} className="btn" style={{ background: '#16a34a', color: '#fff', fontSize: 13, padding: '7px 14px' }}>
              Export
            </button>
          </div>

          <div style={{ display: 'flex', gap: 20, fontSize: 13, marginBottom: 12, color: '#334155', flexWrap: 'wrap' }}>
            <span>Invoices: <strong>{saleTotals.invoices}</strong></span>
            <span>Item Lines: <strong>{saleTotals.lines}</strong></span>
            <span>Total Qty: <strong>{saleTotals.quantity.toLocaleString('en-IN')}</strong> Pcs</span>
            <span>Total Amount: <strong style={{ color: '#16a34a' }}>₹{saleTotals.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</strong></span>
          </div>

          {saleLoading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>Loading sale invoice items...</div>
          ) : saleError ? (
            <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8 }}>{saleError}</div>
          ) : saleRows.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              No sale invoices uploaded for this date range. Use "Upload Daily Sale Invoice" to upload the Tally sale report.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px' }}>Invoice Date</th>
                    <th style={{ padding: '10px 12px' }}>Invoice No</th>
                    <th style={{ padding: '10px 12px' }}>Party Name</th>
                    <th style={{ padding: '10px 12px' }}>PO Number</th>
                    <th style={{ padding: '10px 12px' }}>Item Name</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Qty (Pcs)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Rate (₹)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {saleRows.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{s.invoiceDate}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{s.invoiceNumber}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.partyName}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#2563eb' }}>{s.poNumber || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{s.itemName}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{s.quantity.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{s.rate.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>₹{s.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      ) : loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
          Generating PO Fill Rate & Billing Reconciliation Report...
        </div>
      ) : error ? (
        <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8 }}>
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          No Purchase Orders found matching selected filters. Try adjusting your date range or brand filter.
        </div>
      ) : activeTab === 'summary' ? (

        /* TAB 1: PO LEVEL SUMMARY REPORT TABLE (Matching Client Example 1 & 2 + Multi-Payment Set-Off) */
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '2px solid #cbd5e1', textAlign: 'left', fontSize: 12 }}>
                <th style={{ padding: '10px 12px' }}>Account Name</th>
                <th style={{ padding: '10px 12px' }}>Brand</th>
                <th style={{ padding: '10px 12px' }}>PO No</th>
                <th style={{ padding: '10px 12px' }}>FC / Location</th>
                <th style={{ padding: '10px 12px' }}>PO Date</th>
                <th style={{ padding: '10px 12px' }}>Exp Month</th>
                <th style={{ padding: '10px 12px' }}>PO Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>PO Value (₹)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>PO DELIVERD VALUE</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>PO QUANTITY</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>PO DELIVERD QTY.</th>
                <th style={{ padding: '10px 12px' }}>INVOICE DATE</th>
                <th style={{ padding: '10px 12px' }}>Invoice No</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Fill Rate %</th>
                <th style={{ padding: '10px 12px', minWidth: 150 }}>REMARKS 1</th>
                <th style={{ padding: '10px 12px', minWidth: 150 }}>REMARKS 2</th>
                <th style={{ padding: '10px 12px', minWidth: 120 }}>REMARKS 3</th>
                <th style={{ padding: '10px 12px', minWidth: 120 }}>REMARKS 4</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }} className="no-print">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isExpanded = expandedPoId === r.id;
                const isDelivered = r.poStatus === 'Full Delivery';
                const isPart = r.poStatus === 'Part Delivery';
                const isClosed = r.poStatus.includes('Closed');

                const r1 = editedRemarks[r.id]?.remarks1 ?? r.remarks1 ?? r.remarks ?? '';
                const r2 = editedRemarks[r.id]?.remarks2 ?? r.remarks2 ?? '';
                const r3 = editedRemarks[r.id]?.remarks3 ?? r.remarks3 ?? '';
                const r4 = editedRemarks[r.id]?.remarks4 ?? r.remarks4 ?? '';

                return (
                  <>
                    <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0', background: isExpanded ? '#f8fafc' : '#fff' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1e293b' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1'
                        }}>
                          {r.accountName}
                        </span>
                      </td>

                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#2563eb' }}>
                        {r.brand}
                      </td>

                      <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace' }}>
                        {r.poNumber}
                      </td>

                      <td style={{ padding: '10px 12px', color: '#475569' }}>
                        {r.dcLocation}
                      </td>

                      <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {r.poDate}
                      </td>

                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#475569' }}>
                        {r.poExpMonth}
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: isDelivered ? '#dcfce7' : isPart ? '#fef3c7' : (isClosed ? '#fee2e2' : '#e0f2fe'),
                          color: isDelivered ? '#15803d' : isPart ? '#b45309' : (isClosed ? '#b91c1c' : '#0369a1'),
                          border: isDelivered ? '1px solid #bbf7d0' : isPart ? '1px solid #fde68a' : (isClosed ? '1px solid #fecaca' : '1px solid #bae6fd')
                        }}>
                          {r.poStatus}
                        </span>
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                        ₹{r.poValueInRs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>

                      {/* [1] PO DELIVERED VALUE */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a', background: '#eff6ff' }}>
                        ₹{r.deliveryValueInRs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>

                      {/* [2] PO QUANTITY */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, background: '#eff6ff' }}>
                        {r.poQtyPcs.toLocaleString('en-IN')}
                      </td>

                      {/* [3] PO DELIVERED QTY */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a', background: '#eff6ff' }}>
                        {r.deliveredQtyPcs.toLocaleString('en-IN')}
                      </td>

                      {/* [4] INVOICE DATE */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: '#475569', background: '#eff6ff' }}>
                        {r.invoiceDate || '—'}
                      </td>

                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, color: '#0f172a' }}>
                        {r.invoiceNo}
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700,
                          background: r.fillRatePct >= 90 ? '#dcfce7' : (r.fillRatePct >= 50 ? '#fef3c7' : '#fee2e2'),
                          color: r.fillRatePct >= 90 ? '#15803d' : (r.fillRatePct >= 50 ? '#b45309' : '#b91c1c')
                        }}>
                          {r.fillRatePct}%
                        </span>
                      </td>

                      {/* [5] REMARKS 1 (ITEM NOT SUPPLY FROM BRAND) */}
                      <td style={{ padding: '6px 8px', background: '#fffbeb' }}>
                        <input
                          type="text"
                          className="input"
                          value={r1}
                          onChange={e => handleRemarkChange(r.id, 'remarks1', e.target.value)}
                          onBlur={() => saveRemark(r.id, 'remarks1')}
                          title="Saved automatically when you leave the field"
                          style={{ padding: '4px 8px', fontSize: 11, width: '100%', minWidth: 150, borderRadius: 4, border: remarkBorder(r.id, 'remarks1') }}
                          placeholder="Shortage/unsupplied..."
                        />
                      </td>

                      {/* [6] REMARKS 2 (PO PRICE NOT CORRECT) */}
                      <td style={{ padding: '6px 8px', background: '#fffbeb' }}>
                        <input
                          type="text"
                          className="input"
                          value={r2}
                          onChange={e => handleRemarkChange(r.id, 'remarks2', e.target.value)}
                          onBlur={() => saveRemark(r.id, 'remarks2')}
                          title="Saved automatically when you leave the field"
                          style={{ padding: '4px 8px', fontSize: 11, width: '100%', minWidth: 150, borderRadius: 4, border: remarkBorder(r.id, 'remarks2') }}
                          placeholder="Price mismatch..."
                        />
                      </td>

                      {/* [7] REMARKS 3 (MANUAL FILL) */}
                      <td style={{ padding: '6px 8px', background: '#fffbeb' }}>
                        <input
                          type="text"
                          className="input"
                          value={r3}
                          onChange={e => handleRemarkChange(r.id, 'remarks3', e.target.value)}
                          onBlur={() => saveRemark(r.id, 'remarks3')}
                          title="Saved automatically when you leave the field"
                          style={{ padding: '4px 8px', fontSize: 11, width: '100%', minWidth: 120, borderRadius: 4, border: remarkBorder(r.id, 'remarks3') }}
                          placeholder="Manual fill..."
                        />
                      </td>

                      {/* [8] REMARKS 4 (MANUAL FILL) */}
                      <td style={{ padding: '6px 8px', background: '#fffbeb' }}>
                        <input
                          type="text"
                          className="input"
                          value={r4}
                          onChange={e => handleRemarkChange(r.id, 'remarks4', e.target.value)}
                          onBlur={() => saveRemark(r.id, 'remarks4')}
                          title="Saved automatically when you leave the field"
                          style={{ padding: '4px 8px', fontSize: 11, width: '100%', minWidth: 120, borderRadius: 4, border: remarkBorder(r.id, 'remarks4') }}
                          placeholder="Manual fill..."
                        />
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'center' }} className="no-print">
                        <button
                          onClick={() => setExpandedPoId(isExpanded ? null : r.id)}
                          style={{
                            padding: '3px 8px',
                            fontSize: 11,
                            borderRadius: 4,
                            border: '1px solid #cbd5e1',
                            background: isExpanded ? '#e2e8f0' : '#fff',
                            cursor: 'pointer'
                          }}
                        >
                          {isExpanded ? '▲ Hide' : '▼ Expand'}
                        </button>
                      </td>
                    </tr>

                    {/* EXPANDABLE SUB-ROW: LINE ITEMS & PAYMENT INSTALLMENTS HISTORY */}
                    {isExpanded && (
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <td colSpan={19} style={{ padding: '16px 20px' }}>
                          
                          {/* Sub-Tabs Selector */}
                          <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid #cbd5e1', marginBottom: 12 }}>
                            <button
                              onClick={() => setSubTab('items')}
                              style={{
                                padding: '6px 14px',
                                fontSize: 12,
                                fontWeight: subTab === 'items' ? 700 : 500,
                                color: subTab === 'items' ? '#2563eb' : '#64748b',
                                borderBottom: subTab === 'items' ? '2px solid #2563eb' : 'none',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              Line Items ({r.itemDetails.length})
                            </button>
                            <button
                              onClick={() => setSubTab('payments')}
                              style={{
                                padding: '6px 14px',
                                fontSize: 12,
                                fontWeight: subTab === 'payments' ? 700 : 500,
                                color: subTab === 'payments' ? '#2563eb' : '#64748b',
                                borderBottom: subTab === 'payments' ? '2px solid #2563eb' : 'none',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              Payment Remittance & Installments ({r.paymentInstallments.length})
                            </button>
                          </div>

                          {/* Sub-Tab 1: Line Items Breakdown */}
                          {subTab === 'items' ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, background: '#fff', border: '1px solid #cbd5e1' }}>
                              <thead>
                                <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Item Code</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Chain Item Description</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Tally Item Name</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Brand</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>PO Qty</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Billed Qty</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Shortage</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Unit Rate</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'center' }}>Item Fill Rate %</th>
                                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>Item Remark / Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.itemDetails.map(item => (
                                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{item.chainItemCode}</td>
                                    <td style={{ padding: '6px 10px' }}>{item.chainItemName}</td>
                                    <td style={{ padding: '6px 10px', color: '#2563eb' }}>{item.tallyItemName || '—'}</td>
                                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{item.brandName}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{item.poQtyPcs}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>{item.deliveredQtyPcs}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', color: item.shortageQtyPcs > 0 ? '#b91c1c' : '#475569' }}>{item.shortageQtyPcs}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>₹{item.unitPrice}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: item.itemFillRatePct >= 90 ? '#16a34a' : '#d97706' }}>
                                      {item.itemFillRatePct}%
                                    </td>
                                    <td style={{ padding: '6px 10px', color: item.itemRemark.includes('Short') || item.itemRemark.includes('NOT BILLED') ? '#b91c1c' : '#16a34a' }}>
                                      {item.itemRemark}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (

                            /* Sub-Tab 2: Multi-Installment Payment History */
                            <div>
                              {r.paymentInstallments.length === 0 ? (
                                <div style={{ padding: 16, background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0', color: '#64748b' }}>
                                  No remittance payments recorded yet for PO #{r.poNumber}.
                                </div>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, background: '#fff', border: '1px solid #cbd5e1' }}>
                                  <thead>
                                    <tr style={{ background: '#e2e8f0', color: '#334155' }}>
                                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>Installment #</th>
                                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>Payment Arrival Date</th>
                                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>Bank Ref / UTR</th>
                                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>Invoice Number</th>
                                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>Payment Received (₹)</th>
                                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>TDS / Deduction (₹)</th>
                                      <th style={{ padding: '6px 10px', textAlign: 'left' }}>Narration / Description</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.paymentInstallments.map(inst => (
                                      <tr key={inst.installmentNo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 700 }}>#{inst.installmentNo}</td>
                                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{inst.paymentDate}</td>
                                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#2563eb' }}>{inst.bankRef}</td>
                                        <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{inst.matchedInvoiceNo}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                                          ₹{inst.amountPaid.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#dc2626' }}>
                                          ₹{inst.tdsAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                        </td>
                                        <td style={{ padding: '6px 10px', color: '#475569' }}>{inst.narration}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}

                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

      ) : activeTab === 'item_detail' ? (

        /* TAB 2: ITEM LEVEL DETAIL BREAKDOWN VIEW */
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>PO Number</th>
                <th style={{ padding: '10px 12px' }}>Account</th>
                <th style={{ padding: '10px 12px' }}>Brand</th>
                <th style={{ padding: '10px 12px' }}>Chain Item Code</th>
                <th style={{ padding: '10px 12px' }}>Chain Item Description</th>
                <th style={{ padding: '10px 12px' }}>Tally Item Name</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>PO Qty</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Delivered Qty</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Shortage Qty</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Rate (₹)</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Fill Rate %</th>
                <th style={{ padding: '10px 12px' }}>Item Remarks</th>
              </tr>
            </thead>
            <tbody>
              {allItemRows.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{item.poNumber}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.accountName}</td>
                  <td style={{ padding: '10px 12px', color: '#2563eb', fontWeight: 600 }}>{item.brandName}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{item.chainItemCode}</td>
                  <td style={{ padding: '10px 12px' }}>{item.chainItemName}</td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{item.tallyItemName || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>{item.poQtyPcs}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{item.deliveredQtyPcs}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: item.shortageQtyPcs > 0 ? '#b91c1c' : '#475569' }}>{item.shortageQtyPcs}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>₹{item.unitPrice}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: item.itemFillRatePct >= 90 ? '#16a34a' : '#d97706' }}>
                    {item.itemFillRatePct}%
                  </td>
                  <td style={{ padding: '10px 12px', color: item.itemRemark.includes('Short') || item.itemRemark.includes('NOT BILLED') ? '#b91c1c' : '#16a34a', fontSize: 11 }}>
                    {item.itemRemark}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      ) : (

        /* TAB 3: PAYMENT INSTALLMENTS & REMITTANCE LEDGER VIEW */
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>PO Number</th>
                <th style={{ padding: '10px 12px' }}>Account</th>
                <th style={{ padding: '10px 12px' }}>Installment #</th>
                <th style={{ padding: '10px 12px' }}>Payment Arrival Date</th>
                <th style={{ padding: '10px 12px' }}>Bank Ref / UTR</th>
                <th style={{ padding: '10px 12px' }}>Invoice Number</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Amount Paid (₹)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>TDS / Deduction (₹)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Net Balance Pending (₹)</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Set-Off Status</th>
                <th style={{ padding: '10px 12px' }}>Narration</th>
              </tr>
            </thead>
            <tbody>
              {allPaymentInstallments.map((inst, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700 }}>{inst.poNumber}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{inst.accountName}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>#{inst.installmentNo}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{inst.paymentDate}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#2563eb' }}>{inst.bankRef}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{inst.matchedInvoiceNo}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                    ₹{inst.amountPaid.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>
                    ₹{inst.tdsAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                    ₹{inst.netPendingBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 700,
                      background: inst.setOffStatus === 'FULLY_SET_OFF' ? '#dcfce7' : '#fef3c7',
                      color: inst.setOffStatus === 'FULLY_SET_OFF' ? '#15803d' : '#b45309'
                    }}>
                      {inst.setOffStatus === 'FULLY_SET_OFF' ? 'Set-Off' : 'Partial'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569', fontSize: 11 }}>{inst.narration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
