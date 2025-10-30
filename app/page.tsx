import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="container">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Bhavish CRM</h1>
        <Link className="btn" href="/records">Go to Records</Link>
      </div>
      <div className="card">
        <h3>What you can do</h3>
        <ul>
          <li>Upload Excel (.xls/.xlsx) and PDF files</li>
          <li>Preview Excel summaries and PDFs</li>
          <li>Search, sort, and manage records</li>
        </ul>
        <p className="muted">Use the Records page to get started.</p>
      </div>
    </div>
  );
}



