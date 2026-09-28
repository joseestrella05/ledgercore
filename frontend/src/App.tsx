import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GetAccounts,
  GetAccountBalances,
  GetFinancialSummary,
  GetRecentTransactions,
  CreateTransaction,
  GetDatabasePath
} from '../wailsjs/go/main/App';
import { domain } from '../wailsjs/go/models';
import {
  Wallet,
  ArrowDownLeft,
  Scale,
  TrendingUp,
  PlusCircle,
  Database,
  CheckCircle2,
  AlertCircle,
  Trash2,
  X,
  BookOpen,
  Layers,
  Calendar,
  FileText
} from 'lucide-react';

interface EntryRow {
  accountId: number;
  entryType: 'DEBIT' | 'CREDIT';
  amountDOP: string; // user input in DOP decimal
  notes: string;
}

export function App() {
  // Financial State
  const [summary, setSummary] = useState<domain.FinancialSummary | null>(null);
  const [accounts, setAccounts] = useState<domain.Account[]>([]);
  const [balances, setBalances] = useState<domain.AccountBalance[]>([]);
  const [transactions, setTransactions] = useState<domain.Transaction[]>([]);
  const [dbPath, setDbPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'balances' | 'journal'>('balances');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Reactivity State Mutation Version
  const [mutationVersion, setMutationVersion] = useState<number>(0);
  const triggerStateMutation = useCallback(() => {
    setMutationVersion(v => v + 1);
  }, []);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [txDesc, setTxDesc] = useState<string>('');
  const [txRef, setTxRef] = useState<string>('');
  const [entries, setEntries] = useState<EntryRow[]>([
    { accountId: 0, entryType: 'DEBIT', amountDOP: '', notes: '' },
    { accountId: 0, entryType: 'CREDIT', amountDOP: '', notes: '' },
  ]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Format cents to DOP currency string
  const formatMoney = (cents: number = 0, currency = 'DOP'): string => {
    const dop = cents / 100;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(dop);
  };

  // Reset modal form fields
  const resetModalForm = (accList: domain.Account[] = accounts) => {
    setTxDate(new Date().toISOString().split('T')[0]);
    setTxDesc('');
    setTxRef('');
    setEntries([
      { accountId: accList[0]?.id || 0, entryType: 'DEBIT', amountDOP: '', notes: '' },
      { accountId: accList[accList.length - 1]?.id || accList[1]?.id || 0, entryType: 'CREDIT', amountDOP: '', notes: '' }
    ]);
  };

  // Load all data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sumRes, accRes, balRes, txRes, pathRes] = await Promise.all([
        GetFinancialSummary(),
        GetAccounts(),
        GetAccountBalances(),
        GetRecentTransactions(30),
        GetDatabasePath()
      ]);

      setSummary(sumRes);
      setAccounts(accRes || []);
      setBalances(balRes || []);
      setTransactions(txRes || []);
      setDbPath(pathRes || '');

      // Set default account selections in modal if initial
      if (accRes && accRes.length >= 2 && entries[0].accountId === 0) {
        setEntries([
          { accountId: accRes[0].id, entryType: 'DEBIT', amountDOP: '', notes: '' },
          { accountId: accRes[accRes.length - 1].id, entryType: 'CREDIT', amountDOP: '', notes: '' }
        ]);
      }
    } catch (err: any) {
      console.error('Error cargando datos contables:', err);
      setFeedback({ type: 'error', message: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  }, [entries]);

  // Reactive listener for state mutations
  useEffect(() => {
    loadData();
  }, [mutationVersion]);

  // Filtered account balances
  const filteredBalances = useMemo(() => {
    if (typeFilter === 'ALL') return balances;
    return balances.filter(b => b.type === typeFilter);
  }, [balances, typeFilter]);

  // Double-entry validation calculation
  const { totalDebitCents, totalCreditCents, diffCents, isBalanced } = useMemo(() => {
    let deb = 0;
    let cred = 0;

    for (const e of entries) {
      const val = parseFloat(e.amountDOP);
      if (!isNaN(val) && val > 0) {
        const cents = Math.round(val * 100);
        if (e.entryType === 'DEBIT') deb += cents;
        else if (e.entryType === 'CREDIT') cred += cents;
      }
    }

    const diff = Math.abs(deb - cred);
    const balanced = deb > 0 && cred > 0 && deb === cred;
    return {
      totalDebitCents: deb,
      totalCreditCents: cred,
      diffCents: diff,
      isBalanced: balanced
    };
  }, [entries]);

  // Add / Remove Entry Rows
  const handleAddEntry = () => {
    const defaultAccId = accounts.length > 0 ? accounts[0].id : 0;
    setEntries(prev => [...prev, { accountId: defaultAccId, entryType: 'DEBIT', amountDOP: '', notes: '' }]);
  };

  const handleRemoveEntry = (index: number) => {
    if (entries.length <= 2) return;
    setEntries(prev => prev.filter((_, i) => i !== index));
  };

  // Numeric input change with Auto-Balance on row 1 & intelligent entry type toggle
  const handleEntryChange = (index: number, field: keyof EntryRow, value: any) => {
    setEntries(prev => {
      const next = prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry));

      // Auto-balance optimization:
      // When typing the amount in the first entry of a 2-entry transaction,
      // auto-fill the second entry with the matching value to balance to zero automatically
      if (prev.length === 2 && field === 'amountDOP') {
        if (index === 0) {
          next[1] = {
            ...next[1],
            amountDOP: value
          };
        }
      }

      // Automatically maintain opposite entry types for 2-legged transactions
      if (prev.length === 2 && field === 'entryType') {
        const counterpartIdx = index === 0 ? 1 : 0;
        next[counterpartIdx] = {
          ...next[counterpartIdx],
          entryType: value === 'DEBIT' ? 'CREDIT' : 'DEBIT'
        };
      }

      return next;
    });
  };

  // Submit Transaction: Automatic Reactivity & State Mutation
  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced || !txDesc.trim()) return;

    try {
      setSubmitting(true);
      setFeedback(null);

      const payload = new domain.CreateTransactionInput({
        transaction_date: txDate,
        description: txDesc.trim(),
        reference_id: txRef.trim() || undefined,
        entries: entries.map(ent => new domain.CreateEntryInput({
          account_id: ent.accountId,
          amount: Math.round(parseFloat(ent.amountDOP) * 100),
          entry_type: ent.entryType,
          notes: ent.notes.trim() || undefined,
        }))
      });

      await CreateTransaction(payload);

      // a) Close modal automatically
      setIsModalOpen(false);

      // c) Reset form fields for the next transaction
      resetModalForm();

      // b) Reactive state mutation: trigger immediate re-evaluation of queries
      triggerStateMutation();

      // User feedback
      setFeedback({ type: 'success', message: 'Transacción registrada con éxito. Balances actualizados automáticamente.' });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      console.error('Error registrando transacción:', err);
      setFeedback({ type: 'error', message: err?.message || String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-container">
      {/* Top Header - Refresh button removed per specification */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon-box">
            <Scale size={22} color="#ffffff" />
          </div>
          <div className="brand-text">
            <h1>LedgerCore</h1>
            <div className="brand-subtitle">
              <span>Contabilidad por Partida Doble</span>
              <span className="badge-tag badge-purego">
                <Database size={11} /> SQLite Pure Go
              </span>
            </div>
          </div>
        </div>

        <div className="header-actions">
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <PlusCircle size={16} /> Nueva Transacción
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="app-content">
        {/* Feedback Alert */}
        {feedback && (
          <div style={{ marginBottom: 20 }}>
            <div className={`toast-msg ${feedback.type}`}>
              {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{feedback.message}</span>
            </div>
          </div>
        )}

        {/* Dashboard 4 Metric Cards */}
        <section className="metrics-grid">
          {/* Activos */}
          <div className="metric-card asset">
            <div className="metric-header">
              <span className="metric-title">Activos Totales</span>
              <span className="metric-icon" style={{ color: '#10b981' }}>
                <Wallet size={20} />
              </span>
            </div>
            <div className="metric-value">
              {formatMoney(summary?.total_assets || 0)}
            </div>
            <div className="metric-footer">Bancos, Cuentas por Cobrar y Otros Activos</div>
          </div>

          {/* Pasivos */}
          <div className="metric-card liability">
            <div className="metric-header">
              <span className="metric-title">Pasivos Totales</span>
              <span className="metric-icon" style={{ color: '#f43f5e' }}>
                <ArrowDownLeft size={20} />
              </span>
            </div>
            <div className="metric-value">
              {formatMoney(summary?.total_liabilities || 0)}
            </div>
            <div className="metric-footer">Tarjetas de Crédito y Deudas Comerciales</div>
          </div>

          {/* Patrimonio Neto */}
          <div className="metric-card equity">
            <div className="metric-header">
              <span className="metric-title">Patrimonio Neto</span>
              <span className="metric-icon" style={{ color: '#3b82f6' }}>
                <Scale size={20} />
              </span>
            </div>
            <div className="metric-value">
              {formatMoney(summary?.net_worth || 0)}
            </div>
            <div className="metric-footer">Activos Totales − Pasivos Totales</div>
          </div>

          {/* Flujo Neto Mes */}
          <div className="metric-card netflow">
            <div className="metric-header">
              <span className="metric-title">Flujo Neto del Mes</span>
              <span className="metric-icon" style={{ color: '#a855f7' }}>
                <TrendingUp size={20} />
              </span>
            </div>
            <div className="metric-value" style={{ color: (summary?.monthly_net_flow || 0) >= 0 ? '#34d399' : '#f87171' }}>
              {formatMoney(summary?.monthly_net_flow || 0)}
            </div>
            <div className="metric-footer">Ingresos − Gastos del mes en curso</div>
          </div>
        </section>

        {/* Section Navigation & Filters */}
        <div className="section-nav">
          <div className="tab-group">
            <button
              className={`tab-btn ${activeTab === 'balances' ? 'active' : ''}`}
              onClick={() => setActiveTab('balances')}
            >
              <Layers size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
              Catálogo y Balances
            </button>
            <button
              className={`tab-btn ${activeTab === 'journal' ? 'active' : ''}`}
              onClick={() => setActiveTab('journal')}
            >
              <BookOpen size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
              Libro Diario ({transactions.length})
            </button>
          </div>

          {activeTab === 'balances' && (
            <div style={{ display: 'flex', gap: 6 }}>
              {['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map(type => (
                <button
                  key={type}
                  className={`btn-secondary ${typeFilter === type ? 'active' : ''}`}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderColor: typeFilter === type ? 'var(--accent-blue)' : undefined,
                    color: typeFilter === type ? '#ffffff' : undefined
                  }}
                  onClick={() => setTypeFilter(type)}
                >
                  {type === 'ALL' ? 'TODAS' : type}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tab 1: Accounts and Balances Table */}
        {activeTab === 'balances' && (
          <div className="table-card">
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '100px' }}>Código</th>
                    <th>Cuenta</th>
                    <th>Tipo</th>
                    <th style={{ textAlign: 'right' }}>Débitos Acum.</th>
                    <th style={{ textAlign: 'right' }}>Créditos Acum.</th>
                    <th style={{ textAlign: 'right' }}>Saldo Neto (DOP)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBalances.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)' }}>
                        No hay cuentas que coincidan con el filtro seleccionado.
                      </td>
                    </tr>
                  ) : (
                    filteredBalances.map(acc => (
                      <tr key={acc.id}>
                        <td>
                          <span className="account-code">{acc.account_number}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{acc.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Moneda: {acc.currency}</div>
                        </td>
                        <td>
                          <span className={`type-pill ${acc.type}`}>{acc.type}</span>
                        </td>
                        <td className="amount-mono">
                          {formatMoney(acc.debit_total)}
                        </td>
                        <td className="amount-mono">
                          {formatMoney(acc.credit_total)}
                        </td>
                        <td className="amount-mono" style={{ fontSize: 14 }}>
                          <span className={acc.balance > 0 ? 'amount-positive' : acc.balance < 0 ? 'amount-negative' : 'amount-neutral'}>
                            {formatMoney(acc.balance)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Journal Transactions */}
        {activeTab === 'journal' && (
          <div className="table-card">
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '120px' }}>Fecha</th>
                    <th style={{ width: '90px' }}>Ref</th>
                    <th>Descripción y Asientos</th>
                    <th style={{ textAlign: 'right', width: '160px' }}>Débito</th>
                    <th style={{ textAlign: 'right', width: '160px' }}>Crédito</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                        Aún no se han registrado transacciones en el libro diario.
                        <div style={{ marginTop: 10 }}>
                          <button className="btn-primary" style={{ margin: '0 auto' }} onClick={() => setIsModalOpen(true)}>
                            Crear Primer Asiento
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    transactions.map(tx => (
                      <React.Fragment key={tx.id}>
                        <tr style={{ background: '#0e1526' }}>
                          <td style={{ fontWeight: 600, color: '#94a3b8' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Calendar size={13} /> {tx.transaction_date}
                            </div>
                          </td>
                          <td>
                            {tx.reference_id ? (
                              <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>
                                {tx.reference_id}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-dim)' }}>—</span>
                            )}
                          </td>
                          <td colSpan={3} style={{ fontWeight: 600, color: '#f8fafc' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <FileText size={14} color="#60a5fa" />
                              <span>{tx.description}</span>
                            </div>
                          </td>
                        </tr>
                        {/* Transaction lines */}
                        {tx.entries?.map((entry, idx) => (
                          <tr key={entry.id || idx} style={{ borderBottom: idx === (tx.entries?.length || 0) - 1 ? '2px solid #243048' : undefined }}>
                            <td colSpan={2}></td>
                            <td style={{ paddingLeft: entry.entry_type === 'CREDIT' ? 36 : 18 }}>
                              <span className="account-code" style={{ marginRight: 8, fontSize: 11 }}>
                                {entry.account_number}
                              </span>
                              <span>{entry.account_name}</span>
                              {entry.notes && (
                                <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8, fontStyle: 'italic' }}>
                                  ({entry.notes})
                                </span>
                              )}
                            </td>
                            <td className="amount-mono">
                              {entry.entry_type === 'DEBIT' ? (
                                <span className="amount-positive">{formatMoney(entry.amount)}</span>
                              ) : null}
                            </td>
                            <td className="amount-mono">
                              {entry.entry_type === 'CREDIT' ? (
                                <span style={{ color: '#60a5fa' }}>{formatMoney(entry.amount)}</span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Database size={13} color="#10b981" />
          <span>Base de datos SQLite:</span>
          <span className="db-path-badge">{dbPath || '~/Library/Application Support/LedgerCore/ledger.db'}</span>
        </div>
        <div>
          <span>LedgerCore v1.0.0 • Pure Go CGO=0 WAL Mode</span>
        </div>
      </footer>

      {/* Double-Entry Transaction Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => !submitting && setIsModalOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <Scale size={20} color="#3b82f6" />
                Registrar Transacción Contable (Partida Doble)
              </h2>
              <button className="btn-close" onClick={() => setIsModalOpen(false)} disabled={submitting}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitTransaction}>
              <div className="modal-body">
                {/* Header Inputs */}
                <div className="form-grid-3">
                  <div className="form-field">
                    <label>Fecha</label>
                    <input
                      type="date"
                      className="input-control"
                      value={txDate}
                      onChange={e => setTxDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Descripción General</label>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="Ej. Cobro de factura soporte #104"
                      value={txDesc}
                      onChange={e => setTxDesc(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Referencia / Comprobante</label>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="Ej. BNC-9821"
                      value={txRef}
                      onChange={e => setTxRef(e.target.value)}
                    />
                  </div>
                </div>

                {/* Entries Section */}
                <div className="entries-header">
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>
                    Asientos Contables (Mínimo 2 renglones)
                  </span>
                  <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleAddEntry}>
                    <PlusCircle size={14} /> Agregar Asiento
                  </button>
                </div>

                <div className="entries-table-wrapper">
                  <div className="entry-row-grid header">
                    <div>Cuenta</div>
                    <div>Tipo Asiento</div>
                    <div style={{ textAlign: 'right' }}>Monto (RD$)</div>
                    <div>Nota / Glosa</div>
                    <div></div>
                  </div>

                  {entries.map((entry, index) => (
                    <div key={index} className="entry-row-grid">
                      {/* Account Selector */}
                      <div>
                        <select
                          className="select-control"
                          value={entry.accountId}
                          onChange={e => handleEntryChange(index, 'accountId', Number(e.target.value))}
                          required
                        >
                          <option value={0} disabled>Seleccionar cuenta...</option>
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.account_number} - {acc.name} ({acc.type})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Debit / Credit Selector */}
                      <div>
                        <div className="type-selector-pill">
                          <div
                            className={`pill-opt ${entry.entryType === 'DEBIT' ? 'selected-debit' : ''}`}
                            onClick={() => handleEntryChange(index, 'entryType', 'DEBIT')}
                          >
                            DÉBITO
                          </div>
                          <div
                            className={`pill-opt ${entry.entryType === 'CREDIT' ? 'selected-credit' : ''}`}
                            onClick={() => handleEntryChange(index, 'entryType', 'CREDIT')}
                          >
                            CRÉDITO
                          </div>
                        </div>
                      </div>

                      {/* Amount in DOP with Auto-Balance */}
                      <div>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="input-control"
                          style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                          placeholder="0.00"
                          value={entry.amountDOP}
                          onChange={e => handleEntryChange(index, 'amountDOP', e.target.value)}
                          required
                        />
                      </div>

                      {/* Line Notes */}
                      <div>
                        <input
                          type="text"
                          className="input-control"
                          placeholder="Detalle opcional del asiento"
                          value={entry.notes}
                          onChange={e => handleEntryChange(index, 'notes', e.target.value)}
                        />
                      </div>

                      {/* Delete button */}
                      <div>
                        {entries.length > 2 && (
                          <button
                            type="button"
                            className="btn-icon-danger"
                            title="Eliminar fila"
                            onClick={() => handleRemoveEntry(index)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Double-Entry Balancing Bar */}
                <div className="balance-check-bar">
                  <div className="balance-numbers">
                    <div>
                      <span className="bal-label">Total Débitos:</span>
                      <span className="bal-val" style={{ color: '#34d399' }}>
                        {formatMoney(totalDebitCents)}
                      </span>
                    </div>
                    <div>
                      <span className="bal-label">Total Créditos:</span>
                      <span className="bal-val" style={{ color: '#60a5fa' }}>
                        {formatMoney(totalCreditCents)}
                      </span>
                    </div>
                    <div>
                      <span className="bal-label">Diferencia:</span>
                      <span className="bal-val" style={{ color: diffCents === 0 ? '#94a3b8' : '#f87171' }}>
                        {formatMoney(diffCents)}
                      </span>
                    </div>
                  </div>

                  <div className={`balance-status-badge ${isBalanced ? 'status-balanced' : 'status-unbalanced'}`}>
                    {isBalanced ? (
                      <>
                        <CheckCircle2 size={15} /> BALANCEADO
                      </>
                    ) : (
                      <>
                        <AlertCircle size={15} /> DESBALANCEADO
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!isBalanced || submitting || !txDesc.trim()}
                  style={{ opacity: !isBalanced || submitting || !txDesc.trim() ? 0.5 : 1 }}
                >
                  {submitting ? 'Guardando...' : 'Confirmar y Guardar Asiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
