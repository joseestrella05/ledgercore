package service

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"ledgercore/internal/domain"
)

// LedgerService handles double-entry accounting business logic
type LedgerService struct {
	db *sql.DB
}

// NewLedgerService creates a new instance of LedgerService
func NewLedgerService(db *sql.DB) *LedgerService {
	return &LedgerService{db: db}
}

// GetAccounts returns all registered accounts
func (s *LedgerService) GetAccounts() ([]domain.Account, error) {
	query := `
		SELECT id, account_number, name, type, currency, is_active, created_at
		FROM accounts
		ORDER BY account_number ASC
	`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("error consultando cuentas: %w", err)
	}
	defer rows.Close()

	var accounts []domain.Account
	for rows.Next() {
		var a domain.Account
		var isActiveInt int
		if err := rows.Scan(&a.ID, &a.AccountNumber, &a.Name, &a.Type, &a.Currency, &isActiveInt, &a.CreatedAt); err != nil {
			return nil, fmt.Errorf("error leyendo cuenta: %w", err)
		}
		a.IsActive = (isActiveInt == 1)
		accounts = append(accounts, a)
	}

	return accounts, nil
}

// GetAccountBalances returns all active accounts with their debits, credits, and net balances
func (s *LedgerService) GetAccountBalances() ([]domain.AccountBalance, error) {
	query := `
		SELECT
			a.id, a.account_number, a.name, a.type, a.currency, a.is_active, a.created_at,
			COALESCE(SUM(CASE WHEN je.entry_type = 'DEBIT' THEN je.amount ELSE 0 END), 0) AS debit_total,
			COALESCE(SUM(CASE WHEN je.entry_type = 'CREDIT' THEN je.amount ELSE 0 END), 0) AS credit_total
		FROM accounts a
		LEFT JOIN journal_entries je ON a.id = je.account_id
		WHERE a.is_active = 1
		GROUP BY a.id, a.account_number, a.name, a.type, a.currency, a.is_active, a.created_at
		ORDER BY a.account_number ASC
	`
	rows, err := s.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("error consultando balances de cuentas: %w", err)
	}
	defer rows.Close()

	var balances []domain.AccountBalance
	for rows.Next() {
		var ab domain.AccountBalance
		var isActiveInt int
		if err := rows.Scan(
			&ab.ID, &ab.AccountNumber, &ab.Name, &ab.Type, &ab.Currency, &isActiveInt, &ab.CreatedAt,
			&ab.DebitTotal, &ab.CreditTotal,
		); err != nil {
			return nil, fmt.Errorf("error escaneando balance: %w", err)
		}
		ab.IsActive = (isActiveInt == 1)

		// Calculate natural balance:
		// Assets & Expenses increase with Debit: Balance = Debit - Credit
		// Liabilities, Equity, and Revenue increase with Credit: Balance = Credit - Debit
		switch ab.Type {
		case domain.TypeAsset, domain.TypeExpense:
			ab.Balance = ab.DebitTotal - ab.CreditTotal
		case domain.TypeLiability, domain.TypeEquity, domain.TypeRevenue:
			ab.Balance = ab.CreditTotal - ab.DebitTotal
		default:
			ab.Balance = ab.DebitTotal - ab.CreditTotal
		}

		balances = append(balances, ab)
	}

	return balances, nil
}

// CreateTransaction executes a double-entry transaction within a BEGIN IMMEDIATE TRANSACTION
func (s *LedgerService) CreateTransaction(input domain.CreateTransactionInput) (*domain.Transaction, error) {
	// 1. Basic validation
	if strings.TrimSpace(input.Description) == "" {
		return nil, fmt.Errorf("la descripción de la transacción es obligatoria")
	}

	if len(input.Entries) < 2 {
		return nil, fmt.Errorf("la partida doble requiere un mínimo de 2 asientos (asientos ingresados: %d)", len(input.Entries))
	}

	if strings.TrimSpace(input.TransactionDate) == "" {
		input.TransactionDate = time.Now().Format("2006-01-02")
	}

	// 2. Double-entry validation: sum(DEBIT) must equal sum(CREDIT)
	var totalDebit int64 = 0
	var totalCredit int64 = 0

	for i, entry := range input.Entries {
		if entry.AccountID <= 0 {
			return nil, fmt.Errorf("el asiento #%d no tiene una cuenta válida asignada", i+1)
		}
		if entry.Amount <= 0 {
			return nil, fmt.Errorf("el monto del asiento #%d debe ser mayor a cero (en centavos)", i+1)
		}

		switch entry.EntryType {
		case domain.EntryDebit:
			totalDebit += entry.Amount
		case domain.EntryCredit:
			totalCredit += entry.Amount
		default:
			return nil, fmt.Errorf("tipo de asiento no válido en el renglón #%d: '%s' (debe ser DEBIT o CREDIT)", i+1, entry.EntryType)
		}
	}

	if totalDebit != totalCredit {
		diff := totalDebit - totalCredit
		return nil, fmt.Errorf("desbalance contable: Total Débitos (%d centavos) != Total Créditos (%d centavos). Diferencia: %d centavos", totalDebit, totalCredit, diff)
	}

	// 3. Database execution with BEGIN IMMEDIATE and ROLLBACK on any failure
	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("error iniciando transacción inmediata: %w", err)
	}
	defer tx.Rollback()

	// Insert transaction header
	stmtTx, err := tx.Prepare("INSERT INTO transactions (transaction_date, description, reference_id) VALUES (?, ?, ?)")
	if err != nil {
		return nil, fmt.Errorf("error preparando inserción de transacción: %w", err)
	}
	defer stmtTx.Close()

	res, err := stmtTx.Exec(input.TransactionDate, strings.TrimSpace(input.Description), strings.TrimSpace(input.ReferenceID))
	if err != nil {
		return nil, fmt.Errorf("error registrando cabecera de transacción: %w", err)
	}

	txID, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("error obteniendo ID de la transacción: %w", err)
	}

	// Insert journal entries
	stmtEntry, err := tx.Prepare("INSERT INTO journal_entries (transaction_id, account_id, amount, entry_type, notes) VALUES (?, ?, ?, ?, ?)")
	if err != nil {
		return nil, fmt.Errorf("error preparando inserción de asientos: %w", err)
	}
	defer stmtEntry.Close()

	var savedEntries []domain.JournalEntry
	for _, entry := range input.Entries {
		resEntry, err := stmtEntry.Exec(txID, entry.AccountID, entry.Amount, entry.EntryType, strings.TrimSpace(entry.Notes))
		if err != nil {
			return nil, fmt.Errorf("error insertando asiento para la cuenta ID %d: %w", entry.AccountID, err)
		}
		entryID, _ := resEntry.LastInsertId()

		savedEntries = append(savedEntries, domain.JournalEntry{
			ID:            entryID,
			TransactionID: txID,
			AccountID:     entry.AccountID,
			Amount:        entry.Amount,
			EntryType:     entry.EntryType,
			Notes:         entry.Notes,
		})
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("error haciendo commit de la transacción: %w", err)
	}

	return &domain.Transaction{
		ID:              txID,
		TransactionDate: input.TransactionDate,
		Description:     input.Description,
		ReferenceID:     input.ReferenceID,
		Entries:         savedEntries,
	}, nil
}

// GetFinancialSummary calculates Total Assets, Total Liabilities, Net Worth, and Current Month Net Flow
func (s *LedgerService) GetFinancialSummary() (*domain.FinancialSummary, error) {
	balances, err := s.GetAccountBalances()
	if err != nil {
		return nil, err
	}

	var totalAssets int64 = 0
	var totalLiabilities int64 = 0

	for _, b := range balances {
		switch b.Type {
		case domain.TypeAsset:
			totalAssets += b.Balance
		case domain.TypeLiability:
			totalLiabilities += b.Balance
		}
	}

	netWorth := totalAssets - totalLiabilities

	// Calculate monthly net flow: (Revenue - Expenses) for the current month
	// Current month in SQLite: strftime('%Y-%m', 'now')
	monthlyQuery := `
		SELECT
			COALESCE(SUM(CASE
				WHEN a.type = 'REVENUE' AND je.entry_type = 'CREDIT' THEN je.amount
				WHEN a.type = 'REVENUE' AND je.entry_type = 'DEBIT' THEN -je.amount
				ELSE 0 END), 0) AS monthly_revenue,
			COALESCE(SUM(CASE
				WHEN a.type = 'EXPENSE' AND je.entry_type = 'DEBIT' THEN je.amount
				WHEN a.type = 'EXPENSE' AND je.entry_type = 'CREDIT' THEN -je.amount
				ELSE 0 END), 0) AS monthly_expense
		FROM journal_entries je
		JOIN transactions t ON je.transaction_id = t.id
		JOIN accounts a ON je.account_id = a.id
		WHERE strftime('%Y-%m', t.transaction_date) = strftime('%Y-%m', 'now')
	`

	var monthlyRevenue int64
	var monthlyExpense int64
	err = s.db.QueryRow(monthlyQuery).Scan(&monthlyRevenue, &monthlyExpense)
	if err != nil {
		return nil, fmt.Errorf("error calculando flujo mensual: %w", err)
	}

	monthlyNetFlow := monthlyRevenue - monthlyExpense

	return &domain.FinancialSummary{
		TotalAssets:      totalAssets,
		TotalLiabilities: totalLiabilities,
		NetWorth:         netWorth,
		MonthlyNetFlow:   monthlyNetFlow,
		Currency:         "DOP",
	}, nil
}

// GetRecentTransactions returns the latest transactions with their entries
func (s *LedgerService) GetRecentTransactions(limit int) ([]domain.Transaction, error) {
	if limit <= 0 {
		limit = 20
	}

	txQuery := `
		SELECT id, transaction_date, description, COALESCE(reference_id, ''), created_at
		FROM transactions
		ORDER BY transaction_date DESC, id DESC
		LIMIT ?
	`
	rows, err := s.db.Query(txQuery, limit)
	if err != nil {
		return nil, fmt.Errorf("error consultando transacciones recientes: %w", err)
	}
	defer rows.Close()

	var transactions []domain.Transaction
	var txIDs []interface{}
	for rows.Next() {
		var t domain.Transaction
		if err := rows.Scan(&t.ID, &t.TransactionDate, &t.Description, &t.ReferenceID, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("error leyendo transacción: %w", err)
		}
		transactions = append(transactions, t)
		txIDs = append(txIDs, t.ID)
	}

	if len(transactions) == 0 {
		return []domain.Transaction{}, nil
	}

	// Fetch entries for all retrieved transactions
	placeholders := make([]string, len(txIDs))
	for i := range txIDs {
		placeholders[i] = "?"
	}

	entryQuery := fmt.Sprintf(`
		SELECT je.id, je.transaction_id, je.account_id, a.account_number, a.name, je.amount, je.entry_type, COALESCE(je.notes, '')
		FROM journal_entries je
		JOIN accounts a ON je.account_id = a.id
		WHERE je.transaction_id IN (%s)
		ORDER BY je.id ASC
	`, strings.Join(placeholders, ","))

	entryRows, err := s.db.Query(entryQuery, txIDs...)
	if err != nil {
		return nil, fmt.Errorf("error consultando asientos de transacciones: %w", err)
	}
	defer entryRows.Close()

	entriesByTx := make(map[int64][]domain.JournalEntry)
	for entryRows.Next() {
		var je domain.JournalEntry
		if err := entryRows.Scan(&je.ID, &je.TransactionID, &je.AccountID, &je.AccountNumber, &je.AccountName, &je.Amount, &je.EntryType, &je.Notes); err != nil {
			return nil, fmt.Errorf("error leyendo asiento: %w", err)
		}
		entriesByTx[je.TransactionID] = append(entriesByTx[je.TransactionID], je)
	}

	for i := range transactions {
		transactions[i].Entries = entriesByTx[transactions[i].ID]
	}

	return transactions, nil
}
