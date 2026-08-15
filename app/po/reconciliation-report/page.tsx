"use client";
import { useState, useEffect, useMemo } from 'react';
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
  poQtyPcs: number;
  deliveredQtyPcs: number;
  invoiceNo: string;
  invoiceDate: string;
  fillRateValuePct: number;
  fillRateQtyPct: number;
  fillRatePct: number;
  remarks: string;
  itemDetails: ItemDetail[];
};

type ReportSummary = {
  totalPOs: number;
  deliveredPOs: number;
  closedPOs: number;
  openPOs: number;
  totalPOValue: number;
  totalBilledValue: number;
  totalPOQty: number;
  totalDeliveredQty: number;
  overallValueFillRatePct: number;
  overallQtyFillRatePct: number;
};

const CHAINS = ['ALL', 'RELIANCE', 'SWIGGY', 'ZEPTO', 'BIGBASKET', 'BLINKIT', 'FLIPKART', 'DMART', 'VISHAL', 'OTHER'];
const BRANDS = ['ALL', 'HEALTHY HUNGER', 'MARVEL', 'EASTERN', "MOTHER'S RECIPE", 'DILBAHAR', 'GENERAL'];
const STATUSES = ['ALL', 'Y - PO Delivered', 'PO Closed', 'Open / Pending', 'Partially Billed'];

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
  const [activeTab, setActiveTab] = useState<'summary' | 'item_detail'>('summary');
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);

  // Available Filter Options from Server
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load report');

      setRows(data.rows || []);
      setSummary(data.summary || null);
      if (data.availableMonths && data.availableMonths.length > 0) {
        setAvailableMonths(data.availableMonths);
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

  // Export to Multi-Sheet Excel Workbook (.xlsx)
  const exportToExcel = () => {
    if (!rows || rows.length === 0) return;

    // Sheet 1: PO Level Summary Report (Matching Client Example 1 & 2)
    const poSummarySheetData = rows.map(r => ({
      'Account / Chain': r.accountName,
      'Brand': r.brand,
      'PO Number': r.poNumber,
      'FC / DC Location': r.dcLocation,
      'PO Date': r.poDate,
      'PO Exp Date': r.poExpDate,
      'PO Exp Month': r.poExpMonth,
      'PO Status': r.poStatus,
      'Location': r.location,
      'PO Value (Rs.)': r.poValueInRs,
      'Delivery / Invoice Value (Rs.)': r.deliveryValueInRs,
      'PO Qty (Pcs)': r.poQtyPcs,
      'Delivered Qty (Pcs)': r.deliveredQtyPcs,
      'Invoice No': r.invoiceNo,
      'Invoice Date': r.invoiceDate,
      'Value Fill Rate %': `${r.fillRateValuePct}%`,
      'Qty Fill Rate %': `${r.fillRateQtyPct}%`,
      'REMARKS (Shortage / Missing Items)': r.remarks,
    }));

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

    // Sheet 3: KPI Executive Summary
    const kpiSummaryData = summary ? [
      { Metric: 'Total POs Count', Value: summary.totalPOs },
      { Metric: 'Delivered POs Count', Value: summary.deliveredPOs },
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
    const wsKPI = XLSX.utils.json_to_sheet(kpiSummaryData);

    XLSX.utils.book_append_sheet(wb, wsPOs, 'PO Summary Report');
    XLSX.utils.book_append_sheet(wb, wsItems, 'Item Level Breakdown');
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

      {/* Navigation Breadcrumb & Header */}
      <div className="no-print" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link href="/po" style={{ color: 'var(--primary)', textDecoration: 'none' }}>📦 PO Management</Link> › Fill Rate & Reco Report
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            📊 PO Fill Rate & Billing Reconciliation Report
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
            Reconcile Chain POs against GLOMIN Actual Billed Sales Invoices • Brand & Chain Tabs • Item-Level Shortage Remarks
          </p>
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={exportToExcel} className="btn" style={{ background: '#16a34a', color: '#fff', fontSize: 13, gap: 6 }}>
            📥 Export Excel (.xlsx)
          </button>
          <button onClick={handlePrint} className="btn secondary" style={{ fontSize: 13, gap: 6 }}>
            📄 Print / PDF
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card no-print" style={{ padding: 20, marginBottom: 24, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'center' }}>
          
          {/* 1. Date Range Picker (1 Year Filter) */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              📅 From Date (1-Year Filter)
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
              📅 To Date
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
              🗓️ Expiry / PO Month
            </label>
            <select
              className="input"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '8px 12px', fontSize: 13 }}
            >
              <option value="ALL">All Months</option>
              <option value="MAR">MAR (March)</option>
              <option value="APR">APR (April)</option>
              <option value="MAY">MAY (May)</option>
              <option value="JUN">JUN (June)</option>
              <option value="JUL">JUL (July)</option>
              <option value="AUG">AUG (August)</option>
              <option value="SEP">SEP (September)</option>
              <option value="OCT">OCT (October)</option>
              <option value="NOV">NOV (November)</option>
              <option value="DEC">DEC (December)</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 3. Account / Chain Selector */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
              🏪 Account / Retail Chain
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
              🏷️ Brand Selection
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
              📌 PO Status
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
            placeholder="🔍 Search by PO Number, Invoice #, Brand, DC Location, Item Code, Remarks..."
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
            {brand === 'ALL' ? '🌐 All Brands' : `🏷️ ${brand}`}
          </button>
        ))}
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
              <span style={{ color: '#16a34a', fontWeight: 600 }}>{summary.deliveredPOs} Delivered</span> • <span style={{ color: '#dc2626', fontWeight: 600 }}>{summary.closedPOs} Closed</span> • <span>{summary.openPOs} Open</span>
            </div>
          </div>

        </div>
      )}

      {/* Main View Tabs */}
      <div className="no-print" style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('summary')}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: activeTab === 'summary' ? 700 : 500,
            color: activeTab === 'summary' ? '#2563eb' : '#64748b',
            borderBottom: activeTab === 'summary' ? '3px solid #2563eb' : 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          📋 PO Level Summary Report ({rows.length})
        </button>
        <button
          onClick={() => setActiveTab('item_detail')}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: activeTab === 'item_detail' ? 700 : 500,
            color: activeTab === 'item_detail' ? '#2563eb' : '#64748b',
            borderBottom: activeTab === 'item_detail' ? '3px solid #2563eb' : 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          🔍 Item Level Detail Breakdown ({allItemRows.length} items)
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
          ⏳ Generating PO Fill Rate & Billing Reconciliation Report...
        </div>
      ) : error ? (
        <div style={{ padding: 20, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8 }}>
          ❌ {error}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          ℹ️ No Purchase Orders found matching selected filters. Try adjusting your date range or brand filter.
        </div>
      ) : activeTab === 'summary' ? (

        /* TAB 1: PO LEVEL SUMMARY REPORT TABLE (Matching Client Example 1 & 2) */
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Account Name</th>
                <th style={{ padding: '10px 12px' }}>Brand</th>
                <th style={{ padding: '10px 12px' }}>PO No</th>
                <th style={{ padding: '10px 12px' }}>FC / Location</th>
                <th style={{ padding: '10px 12px' }}>PO Date</th>
                <th style={{ padding: '10px 12px' }}>Exp Month</th>
                <th style={{ padding: '10px 12px' }}>PO Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>PO Value (₹)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Billed Value (₹)</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>PO Qty</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Delivered</th>
                <th style={{ padding: '10px 12px' }}>Invoice No</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Fill Rate %</th>
                <th style={{ padding: '10px 12px' }}>REMARKS</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }} className="no-print">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isExpanded = expandedPoId === r.id;
                const isDelivered = r.poStatus.includes('Delivered');
                const isClosed = r.poStatus.includes('Closed');

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
                          background: isDelivered ? '#dcfce7' : (isClosed ? '#fee2e2' : '#e0f2fe'),
                          color: isDelivered ? '#15803d' : (isClosed ? '#b91c1c' : '#0369a1'),
                          border: isDelivered ? '1px solid #bbf7d0' : (isClosed ? '1px solid #fecaca' : '1px solid #bae6fd')
                        }}>
                          {r.poStatus}
                        </span>
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                        ₹{r.poValueInRs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                        ₹{r.deliveryValueInRs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {r.poQtyPcs}
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                        {r.deliveredQtyPcs}
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

                      <td style={{ padding: '10px 12px', color: r.remarks.includes('ITEM NOT BILLED') ? '#b91c1c' : '#475569', fontSize: 11, maxWidth: 260 }}>
                        {r.remarks}
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
                          {isExpanded ? '▲ Hide' : '▼ Items'}
                        </button>
                      </td>
                    </tr>

                    {/* EXPANDABLE ITEM LEVEL BREAKDOWN SUB-ROW */}
                    {isExpanded && (
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <td colSpan={15} style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                            📦 Line Item Breakdown for PO #{r.poNumber} ({r.accountName} - {r.brand})
                          </div>
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
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

      ) : (

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
      )}

    </div>
  );
}
